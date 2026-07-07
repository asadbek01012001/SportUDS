package ota

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

// ErrActiveSession — уже есть активная (offered/downloading) OTA-сессия. Назначение нового
// обновления отклоняется (глобальная сериализация, миграция 066). См. §5/§9.
var ErrActiveSession = errors.New("ota: активная сессия обновления уже существует")

// isUniqueViolation — true для PostgreSQL unique_violation (код 23505).
func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

// store.go — доступ к БД для OTA-обвязки (KAN-32): сессии (§8), загрузка .bin из репозитория
// прошивок (firmwares, KAN-29), client_id устройства, запись истории (device_firmware_history,
// KAN-31). Таблицы шарятся с vehicle-service — единая Postgres.

// Session — назначенная сессия передачи прошивки с уже загруженными образами A/B.
// image_A = bin/FWCRC32 (всегда есть); image_B = ImageB/FWCRC32B (NULL у legacy single-image).
type Session struct {
	ID         string
	DeviceUID  int
	FirmwareID string
	Version    string // "ver_major.ver_minor"
	VerMajor   uint16
	VerMinor   uint16
	FWCRC32    uint32 // CRC образа A
	Bin        []byte // образ A
	FWCRC32B   uint32 // CRC образа B (если HasB)
	ImageB     []byte // образ B (nil у legacy)
	HasB       bool   // есть ли валидный образ B (пара A/B)
}

// ImageForActiveSlot возвращает образ СВОБОДНОГО слота по активному слоту устройства (§7.3):
// активен A → шлём image_B (свободен B), активен B → image_A. Legacy без B или неизвестный
// слот → image_A (дефолт, как было). Возвращает (.bin, fw_crc32) выбранного образа.
func (s *Session) ImageForActiveSlot(active string) ([]byte, uint32) {
	if active == "A" && s.HasB {
		return s.ImageB, s.FWCRC32B // свободен B
	}
	return s.Bin, s.FWCRC32 // свободен A (active=B), либо legacy/неизвестно
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// CreateSession создаёт offered-сессию (назначение обновления). FK на firmwares гарантирует,
// что прошивка существует. Возвращает id сессии.
func (s *Store) CreateSession(deviceUID int, firmwareID string) (string, error) {
	var id string
	// pre_ota_version — версия устройства на момент назначения (из OTA/info); health-check (§11)
	// считает успехом ИЗМЕНЕНИЕ версии относительно неё (форматы cmd/OTA/info различаются).
	err := s.db.QueryRow(
		`INSERT INTO ota_sessions (device_uid, firmware_id, status, pre_ota_version)
		 VALUES ($1, $2, 'offered', (SELECT ota_version FROM devices WHERE device_uid=$1))
		 RETURNING id`,
		deviceUID, firmwareID,
	).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			return "", ErrActiveSession // уже есть активная сессия (миграция 066)
		}
		return "", fmt.Errorf("ota: create session: %w", err)
	}
	return id, nil
}

// ClaimOffered атомарно забирает самую старую offered-сессию (FIFO, §3.4 — сервер не знает,
// какое устройство подключилось, на MVP одно устройство, §5), переводит её в downloading и
// загружает .bin + метаданные из firmwares. Возвращает (nil, nil) если offered-сессий нет.
//
// Claim и загрузка .bin — в одной транзакции: если загрузка прошивки упала транзиентно, claim
// откатывается (сессия остаётся offered и переподхватится), а не зависает в downloading навсегда.
// Если прошивка реально удалена (ErrNoRows) — сессия помечается failed в той же транзакции.
func (s *Store) ClaimOffered() (*Session, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("ota: begin claim tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op после Commit; на ошибке возвращает offered

	sess := &Session{}
	err = tx.QueryRow(
		`UPDATE ota_sessions SET status='downloading', updated_at=NOW()
		 WHERE id = (
		     SELECT id FROM ota_sessions WHERE status='offered'
		     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
		 )
		 RETURNING id, device_uid, firmware_id`,
	).Scan(&sess.ID, &sess.DeviceUID, &sess.FirmwareID)
	if err == sql.ErrNoRows {
		return nil, nil // offered-сессий нет
	}
	if err != nil {
		return nil, fmt.Errorf("ota: claim offered: %w", err)
	}

	var crc int64
	var crcB sql.NullInt64
	var imageB []byte
	var major, minor int
	err = tx.QueryRow(
		`SELECT ver_major, ver_minor, fw_crc32, bin, fw_crc32_b, image_b FROM firmwares WHERE id = $1`,
		sess.FirmwareID,
	).Scan(&major, &minor, &crc, &sess.Bin, &crcB, &imageB)
	if err == sql.ErrNoRows {
		// Прошивка удалена — сессия невыполнима, фиксируем failed (не оставляем offered).
		if _, e := tx.Exec(`UPDATE ota_sessions SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`,
			sess.ID, "firmware not found"); e != nil {
			return nil, fmt.Errorf("ota: mark failed: %w", e)
		}
		if e := tx.Commit(); e != nil {
			return nil, fmt.Errorf("ota: commit failed-mark: %w", e)
		}
		return nil, fmt.Errorf("ota: firmware %s not found", sess.FirmwareID)
	}
	if err != nil {
		// Транзиентная ошибка загрузки — rollback вернёт сессию в offered (переподхватится).
		return nil, fmt.Errorf("ota: load firmware %s: %w", sess.FirmwareID, err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("ota: commit claim: %w", err)
	}
	sess.VerMajor = uint16(major)
	sess.VerMinor = uint16(minor)
	sess.FWCRC32 = uint32(crc)
	// Образ B (пара A/B, миграция 070) — есть только если оба поля непусты.
	if crcB.Valid && len(imageB) > 0 {
		sess.ImageB = imageB
		sess.FWCRC32B = uint32(crcB.Int64)
		sess.HasB = true
	}
	sess.Version = fmt.Sprintf("%d.%d", major, minor)
	return sess, nil
}

// UpdateStatus обновляет статус сессии, последний подтверждённый seq и (опц.) ошибку.
func (s *Store) UpdateStatus(sessionID, status string, lastSeq int, errMsg string) error {
	var errVal interface{}
	if errMsg != "" {
		errVal = errMsg
	}
	_, err := s.db.Exec(
		`UPDATE ota_sessions SET status=$2, current_seq=$3, error=$4, updated_at=NOW() WHERE id=$1`,
		sessionID, status, lastSeq, errVal,
	)
	if err != nil {
		return fmt.Errorf("ota: update status: %w", err)
	}
	return nil
}

// FirmwareVersion возвращает ver_major/ver_minor прошивки (для payload MQTT-команды §7).
func (s *Store) FirmwareVersion(firmwareID string) (uint16, uint16, error) {
	var major, minor int
	err := s.db.QueryRow(
		`SELECT ver_major, ver_minor FROM firmwares WHERE id = $1`, firmwareID,
	).Scan(&major, &minor)
	if err != nil {
		return 0, 0, fmt.Errorf("ota: firmware version %s: %w", firmwareID, err)
	}
	return uint16(major), uint16(minor), nil
}

// ClientIDByUID возвращает MQTT client_id устройства по device_uid (для топика команды §7).
func (s *Store) ClientIDByUID(deviceUID int) (string, error) {
	var clientID string
	err := s.db.QueryRow(
		`SELECT mqtt_client_id FROM devices WHERE device_uid = $1`, deviceUID,
	).Scan(&clientID)
	if err != nil {
		return "", fmt.Errorf("ota: client_id for device_uid=%d: %w", deviceUID, err)
	}
	return clientID, nil
}

// ReapStaleSessions помечает зависшие активные сессии как failed, освобождая глобальный
// single-active слот (миграция 066). Без него осиротевшая сессия блокирует ВСЕ будущие
// назначения по парку:
//   - 'downloading' старше downloadingAge — осиротела после краша/рестарта пода (живой handle
//     завершился бы за connMaxDuration; деплой рестартит под между Commit и UpdateStatus).
//   - 'offered' старше offeredAge — устройство так и не подключилось после MQTT-триггера.
//
// Возвращает число помеченных сессий.
func (s *Store) ReapStaleSessions(downloadingAge, offeredAge time.Duration) (int64, error) {
	res, err := s.db.Exec(
		`UPDATE ota_sessions SET status='failed', error='stale: reaped', updated_at=NOW()
		 WHERE (status='downloading' AND updated_at < NOW() - ($1 * INTERVAL '1 second'))
		    OR (status='offered'    AND updated_at < NOW() - ($2 * INTERVAL '1 second'))`,
		downloadingAge.Seconds(), offeredAge.Seconds(),
	)
	if err != nil {
		return 0, fmt.Errorf("ota: reap stale sessions: %w", err)
	}
	return res.RowsAffected()
}

// RecordHistory пишет запись в историю прошивок устройства (KAN-31, §5).
func (s *Store) RecordHistory(deviceUID int, version, result string) error {
	if result == "" {
		result = "pending"
	}
	_, err := s.db.Exec(
		`INSERT INTO device_firmware_history (device_uid, version, result) VALUES ($1, $2, $3)`,
		deviceUID, version, result,
	)
	if err != nil {
		return fmt.Errorf("ota: record history: %w", err)
	}
	return nil
}
