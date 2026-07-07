package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"hash/crc32"
	"strconv"

	"github.com/energolink/vehicle-service/internal/model"
)

// ErrFirmwareInUse — прошивку нельзя удалить: есть активная OTA-сессия (offered/downloading)
// или активная раскатка (running). Handler конвертирует в 409 Conflict.
var ErrFirmwareInUse = errors.New("firmware in use by active OTA session or rollout")

// ErrDuplicateFirmware — версия major.minor.patch для этого target уже существует
// (unique firmwares_ver_unique). Handler конвертирует в 409 Conflict.
var ErrDuplicateFirmware = errors.New("firmware version already exists for this target")

// firmwares.go — OTA-репозиторий прошивок (KAN-29/30). При загрузке сервер сам считает размер и
// whole-image CRC-32/ISO-HDLC (== crc32.IEEE, как в устройстве). Репо глобальный (не org-scoped):
// прошивки общие для парка, управляются админом/Hardware.

// FirmwareCRC32 — whole-image CRC прошивки (CRC-32/ISO-HDLC). Тот же алгоритм, что в OTA-протоколе.
func FirmwareCRC32(bin []byte) uint32 { return crc32.ChecksumIEEE(bin) }

const firmwareMetaCols = `id, ver_major, ver_minor, ver_patch, target, fw_size, fw_crc32,
	COALESCE(release_notes, ''), status, channel, COALESCE(uploaded_by, ''), created_at,
	fw_size_b, fw_crc32_b, COALESCE(pair_check, ''), COALESCE(pair_check_detail, '')`

func scanFirmware(s interface {
	Scan(...interface{}) error
}) (*model.Firmware, error) {
	var f model.Firmware
	var crc int64
	var sizeB, crcB sql.NullInt64
	if err := s.Scan(&f.ID, &f.VerMajor, &f.VerMinor, &f.VerPatch, &f.Target, &f.FWSize, &crc,
		&f.ReleaseNotes, &f.Status, &f.Channel, &f.UploadedBy, &f.CreatedAt,
		&sizeB, &crcB, &f.PairCheck, &f.PairCheckDetail); err != nil {
		return nil, err
	}
	f.FWCRC32 = uint32(crc)
	if sizeB.Valid {
		v := int(sizeB.Int64)
		f.FWSizeB = &v
	}
	if crcB.Valid {
		v := uint32(crcB.Int64)
		f.FWCRC32B = &v
	}
	f.Version = strconv.Itoa(f.VerMajor) + "." + strconv.Itoa(f.VerMinor) + "." + strconv.Itoa(f.VerPatch)
	return &f, nil
}

// CreateFirmware — legacy single-image (image_A только; image_B/pair_check NULL). Делегирует в пару.
func (r *VehicleRepository) CreateFirmware(verMajor, verMinor, verPatch int, target string, bin []byte, releaseNotes, channel, status, uploadedBy string) (*model.Firmware, error) {
	return r.CreateFirmwarePair(verMajor, verMinor, verPatch, target, bin, nil, releaseNotes, channel, status, uploadedBy)
}

// CreateFirmwarePair сохраняет версию с парой образов A/B (§7.1). binA → image_A (bin/fw_size/fw_crc32),
// binB → image_B (если nil — legacy single, без сверки). Сервер сам считает размеры и CRC обоих и
// выполняет структурную сверку пары (§7.2, см. VerifyABPair) — результат в pair_check/pair_check_detail.
func (r *VehicleRepository) CreateFirmwarePair(verMajor, verMinor, verPatch int, target string, binA, binB []byte, releaseNotes, channel, status, uploadedBy string) (*model.Firmware, error) {
	if channel == "" {
		channel = "stable"
	}
	if status == "" {
		status = "draft"
	}
	// image_B и его метаданные NULL для legacy single; для пары — считаем размер/CRC и сверяем.
	var imageB interface{}
	var sizeB, crcB, pairCheck, pairDetail interface{}
	if binB != nil {
		res := VerifyABPair(binA, binB)
		imageB = binB
		sizeB = len(binB)
		crcB = int64(FirmwareCRC32(binB))
		pairCheck = res.Status
		pairDetail = res.Detail
	}
	// RETURNING напрямую (без CTE+SELECT): firmwareMetaCols содержит COALESCE(...) над колонками
	// firmwares — это валидные выражения в RETURNING. Обёртка `WITH ins AS (... RETURNING ...) SELECT
	// ... FROM ins` ломалась: COALESCE-колонки в CTE именуются `coalesce`, а внешний SELECT снова
	// ссылался на release_notes/uploaded_by/pair_check → «column ... does not exist» (KAN-41).
	row := r.db.QueryRow(`
		INSERT INTO firmwares (ver_major, ver_minor, ver_patch, target, fw_size, fw_crc32, bin,
			image_b, fw_size_b, fw_crc32_b, pair_check, pair_check_detail,
			release_notes, channel, status, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING `+firmwareMetaCols,
		verMajor, verMinor, verPatch, target, len(binA), int64(FirmwareCRC32(binA)), binA,
		imageB, sizeB, crcB, pairCheck, pairDetail,
		releaseNotes, channel, status, uploadedBy)
	fw, err := scanFirmware(row)
	if err != nil && isUniqueViolation(err) {
		return nil, ErrDuplicateFirmware // та же версия+target уже есть → 409
	}
	return fw, err
}

func (r *VehicleRepository) GetFirmwares() ([]model.Firmware, error) {
	rows, err := r.db.Query(`SELECT ` + firmwareMetaCols + ` FROM firmwares ORDER BY ver_major DESC, ver_minor DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Firmware{}
	for rows.Next() {
		f, err := scanFirmware(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *f)
	}
	return out, rows.Err()
}

func (r *VehicleRepository) GetFirmwareByID(id string) (*model.Firmware, error) {
	return scanFirmware(r.db.QueryRow(`SELECT `+firmwareMetaCols+` FROM firmwares WHERE id = $1::uuid`, id))
}

// GetFirmwareBin — сам .bin + метаданные (для download и OTA-передачи).
func (r *VehicleRepository) GetFirmwareBin(id string) ([]byte, *model.Firmware, error) {
	var bin []byte
	row := r.db.QueryRow(`SELECT bin, `+firmwareMetaCols+` FROM firmwares WHERE id = $1::uuid`, id)
	var f model.Firmware
	var crc int64
	var sizeB, crcB sql.NullInt64
	if err := row.Scan(&bin, &f.ID, &f.VerMajor, &f.VerMinor, &f.Target, &f.FWSize, &crc,
		&f.ReleaseNotes, &f.Status, &f.Channel, &f.UploadedBy, &f.CreatedAt,
		&sizeB, &crcB, &f.PairCheck, &f.PairCheckDetail); err != nil {
		return nil, nil, err
	}
	f.FWCRC32 = uint32(crc)
	if sizeB.Valid {
		v := int(sizeB.Int64)
		f.FWSizeB = &v
	}
	if crcB.Valid {
		v := uint32(crcB.Int64)
		f.FWCRC32B = &v
	}
	f.Version = strconv.Itoa(f.VerMajor) + "." + strconv.Itoa(f.VerMinor)
	return bin, &f, nil
}

// UpdateFirmwareMeta — частичная правка статуса/канала/notes (nil = не менять).
func (r *VehicleRepository) UpdateFirmwareMeta(id string, status, channel, releaseNotes *string) (*model.Firmware, error) {
	// RETURNING напрямую (тот же фикс CTE-бага, что и в CreateFirmwarePair — KAN-41).
	row := r.db.QueryRow(`
		UPDATE firmwares SET
			status        = COALESCE($2, status),
			channel       = COALESCE($3, channel),
			release_notes = COALESCE($4, release_notes)
		WHERE id = $1::uuid
		RETURNING `+firmwareMetaCols,
		id, argStr(status), argStr(channel), argStr(releaseNotes))
	return scanFirmware(row)
}

// DeleteFirmware удаляет версию прошивки. Запрещает (ErrFirmwareInUse) при активной OTA-сессии
// (offered/downloading) или активной раскатке (running) — нельзя удалять прошивку на лету. Историю
// (завершённые сессии/раскатки + их таргеты по ON DELETE CASCADE) сносит в той же транзакции.
// found=false → прошивки нет (404). FK ota_sessions/ota_rollouts на firmwares — RESTRICT, поэтому
// удаляем зависимые строки до самой прошивки.
func (r *VehicleRepository) DeleteFirmware(id string) (bool, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return false, fmt.Errorf("delete firmware: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op после Commit

	var dummy int
	// Активная сессия?
	switch e := tx.QueryRow(
		`SELECT 1 FROM ota_sessions WHERE firmware_id=$1::uuid AND status IN ('offered','downloading') LIMIT 1`,
		id).Scan(&dummy); e {
	case nil:
		return false, ErrFirmwareInUse
	case sql.ErrNoRows:
		// ок, нет активной сессии
	default:
		return false, fmt.Errorf("delete firmware: check session: %w", e)
	}
	// Активная раскатка?
	switch e := tx.QueryRow(
		`SELECT 1 FROM ota_rollouts WHERE firmware_id=$1::uuid AND status='running' LIMIT 1`,
		id).Scan(&dummy); e {
	case nil:
		return false, ErrFirmwareInUse
	case sql.ErrNoRows:
		// ок
	default:
		return false, fmt.Errorf("delete firmware: check rollout: %w", e)
	}
	// Снос истории: rollouts (каскадит targets) + sessions, затем сама прошивка.
	if _, err = tx.Exec(`DELETE FROM ota_rollouts WHERE firmware_id=$1::uuid`, id); err != nil {
		return false, fmt.Errorf("delete firmware: rollouts: %w", err)
	}
	if _, err = tx.Exec(`DELETE FROM ota_sessions WHERE firmware_id=$1::uuid`, id); err != nil {
		return false, fmt.Errorf("delete firmware: sessions: %w", err)
	}
	res, err := tx.Exec(`DELETE FROM firmwares WHERE id=$1::uuid`, id)
	if err != nil {
		return false, fmt.Errorf("delete firmware: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return false, nil // не найдена — Rollback откатит удаление истории
	}
	if err = tx.Commit(); err != nil {
		return false, fmt.Errorf("delete firmware: commit: %w", err)
	}
	return true, nil
}
