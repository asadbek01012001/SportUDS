package handler

import (
	"database/sql"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/energolink/vehicle-service/internal/repository"
)

// firmwares.go — REST OTA-репозитория прошивок (KAN-29/30). Загрузка .bin (multipart) → сервер
// сам считает размер + CRC-32/ISO-HDLC + валидирует ≤64 КБ (слот). Управление статусом/каналом.
// Глобальный (не org-scoped) ресурс; доступ ограничен в gateway (admin/superadmin).

// fwSlotSize — максимум прошивки (слот A/B, §2). Должен совпадать с ota.SlotSize в mqtt-service.
const fwSlotSize = 64 * 1024

// UploadFirmware принимает пару образов A/B (§7.1): file_a (обяз.) + file_b (опц.). Legacy-клиент
// может слать одиночный file (= image_A). Сервер сам считает размер+CRC обоих и сверяет пару (§7.2).
func (h *VehicleHandler) UploadFirmware(c *gin.Context) {
	// image_A: новый UI шлёт file_a; старый — file.
	fhA, err := c.FormFile("file_a")
	if err != nil {
		fhA, err = c.FormFile("file")
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_a (.bin) обязателен"})
		return
	}
	binA, status, msg := readFirmwareUpload(fhA, "A")
	if status != 0 {
		c.JSON(status, gin.H{"error": msg})
		return
	}

	// image_B опционален: есть → пара A/B; нет → legacy single.
	var binB []byte
	if fhB, e := c.FormFile("file_b"); e == nil {
		var bstatus int
		var bmsg string
		binB, bstatus, bmsg = readFirmwareUpload(fhB, "B")
		if bstatus != 0 {
			c.JSON(bstatus, gin.H{"error": bmsg})
			return
		}
	}

	verMajor, err1 := strconv.Atoi(c.PostForm("ver_major"))
	verMinor, err2 := strconv.Atoi(c.PostForm("ver_minor"))
	verPatch, _ := strconv.Atoi(c.PostForm("ver_patch")) // patch опционален (дефолт 0)
	target := c.PostForm("target")
	if err1 != nil || err2 != nil || target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ver_major, ver_minor (int) и target обязательны"})
		return
	}
	// status опционален; пустой → draft в репо. Валидируем по allowlist (форма ограничивает, но
	// прямой multipart мог бы прислать произвольную строку — у колонки нет CHECK).
	fwStatus := c.PostForm("status")
	if fwStatus != "" && fwStatus != "draft" && fwStatus != "beta" && fwStatus != "stable" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status: draft | beta | stable"})
		return
	}

	fw, err := h.repo.CreateFirmwarePair(verMajor, verMinor, verPatch, target, binA, binB,
		c.PostForm("release_notes"), c.PostForm("channel"), fwStatus, callerID(c))
	if err == repository.ErrDuplicateFirmware {
		c.JSON(http.StatusConflict, gin.H{"error": "версия прошивки для этого типа устройства уже существует"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, fw)
}

// readFirmwareUpload читает загруженный .bin с капом слота. Возвращает (bin, 0, "") при успехе,
// либо (nil, httpStatus, msg): валидация (пустой/большой) → 400, ошибка I/O (open/read) → 500.
// slot — метка ("A"/"B") для сообщения.
func readFirmwareUpload(fh *multipart.FileHeader, slot string) ([]byte, int, string) {
	if fh.Size > fwSlotSize {
		return nil, http.StatusBadRequest, "образ " + slot + " больше слота (64 КБ)"
	}
	f, err := fh.Open()
	if err != nil {
		return nil, http.StatusInternalServerError, err.Error()
	}
	defer f.Close()
	bin, err := io.ReadAll(io.LimitReader(f, fwSlotSize+1))
	if err != nil {
		return nil, http.StatusInternalServerError, err.Error()
	}
	if len(bin) == 0 || len(bin) > fwSlotSize {
		return nil, http.StatusBadRequest, "образ " + slot + " пустой или больше 64 КБ"
	}
	return bin, 0, ""
}

func (h *VehicleHandler) GetFirmwares(c *gin.Context) {
	list, err := h.repo.GetFirmwares()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list, "total": len(list)})
}

func (h *VehicleHandler) GetFirmwareByID(c *gin.Context) {
	fw, err := h.repo.GetFirmwareByID(c.Param("id"))
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "firmware not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, fw)
}

func (h *VehicleHandler) DownloadFirmware(c *gin.Context) {
	bin, fw, err := h.repo.GetFirmwareBin(c.Param("id"))
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "firmware not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", "attachment; filename=fw_"+fw.Version+".bin")
	c.Data(http.StatusOK, "application/octet-stream", bin)
}

func (h *VehicleHandler) PatchFirmware(c *gin.Context) {
	var req struct {
		Status       *string `json:"status"`
		Channel      *string `json:"channel"`
		ReleaseNotes *string `json:"release_notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	fw, err := h.repo.UpdateFirmwareMeta(c.Param("id"), req.Status, req.Channel, req.ReleaseNotes)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "firmware not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, fw)
}

// DeleteFirmware удаляет версию прошивки. 409 если прошивка в активной OTA-сессии/раскатке.
func (h *VehicleHandler) DeleteFirmware(c *gin.Context) {
	found, err := h.repo.DeleteFirmware(c.Param("id"))
	if err == repository.ErrFirmwareInUse {
		c.JSON(http.StatusConflict, gin.H{"error": "прошивка используется в активном обновлении или раскатке"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "firmware not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
