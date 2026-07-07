package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/energolink/vehicle-service/internal/mqttctl"
)

// device_registry.go — REST реестра устройств для OTA (KAN-31). Текущая версия из телеметрии +
// история прошивок. Org-scoped (admin видит свою орг, superadmin — все).

func (h *VehicleHandler) GetDeviceRegistry(c *gin.Context) {
	list, err := h.repo.GetDeviceRegistry(callerOrg(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list, "total": len(list)})
}

// GetOtaSessions — журнал/мониторинг OTA-сессий (§6/§7). Org-scoped. Фронт сам делит на
// «Журнал» (все) и «Мониторинг» (активные: offered/downloading/applying).
func (h *VehicleHandler) GetOtaSessions(c *gin.Context) {
	list, err := h.repo.ListOtaSessions(callerOrg(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list, "total": len(list)})
}

// StartDeviceUpdate назначает прошивку устройству (KAN-32, §7): просит mqtt-service создать
// offered-сессию и опубликовать MQTT-команду. Устройство затем само откроет TCP к OTA-серверу.
// Tenant-guard: устройство должно быть видимо в орг-скоупе вызывающего (superadmin — все).
func (h *VehicleHandler) StartDeviceUpdate(c *gin.Context) {
	if h.mqttCtl == nil || !h.mqttCtl.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "mqtt integration disabled"})
		return
	}
	uid, err := strconv.Atoi(c.Param("uid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_uid должен быть числом"})
		return
	}
	var req struct {
		FirmwareID string `json:"firmware_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.FirmwareID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "firmware_id обязателен"})
		return
	}

	// Org-isolation: устройство должно присутствовать в реестре, видимом вызывающему.
	devices, err := h.repo.GetDeviceRegistry(callerOrg(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	found := false
	for _, d := range devices {
		if d.DeviceUID == uid {
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "устройство не найдено"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if err := h.mqttCtl.StartOTA(ctx, uid, req.FirmwareID); err != nil {
		// Отражаем семантику ответа mqtt-service, не светя внутренний путь/тело.
		var he *mqttctl.HTTPError
		if errors.As(err, &he) {
			switch he.Code {
			case http.StatusConflict:
				c.JSON(http.StatusConflict, gin.H{"error": "обновление для устройства уже запущено"})
			case http.StatusBadRequest:
				c.JSON(http.StatusBadRequest, gin.H{"error": "некорректный запрос обновления"})
			case http.StatusNotFound:
				c.JSON(http.StatusNotFound, gin.H{"error": "устройство или прошивка не найдены"})
			default:
				c.JSON(http.StatusBadGateway, gin.H{"error": "не удалось запустить обновление"})
			}
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "не удалось запустить обновление"})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"status": "offered", "device_uid": uid, "firmware_id": req.FirmwareID})
}

func (h *VehicleHandler) GetDeviceFirmwareHistory(c *gin.Context) {
	uid, err := strconv.Atoi(c.Param("uid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_uid должен быть числом"})
		return
	}
	hist, err := h.repo.GetDeviceFirmwareHistory(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": hist, "total": len(hist)})
}
