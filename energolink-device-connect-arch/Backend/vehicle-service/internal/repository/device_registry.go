package repository

import (
	"database/sql"

	"github.com/energolink/vehicle-service/internal/model"
)

// device_registry.go — минимальный реестр устройств для OTA (KAN-31, §5). Текущая версия прошивки
// из последней телеметрии (device_telemetry.ver, добавлено в KAN-10b) + история прошивок.
// Org-scope через vehicles (у devices нет прямой organization_id); orgID="" → все (superadmin).

func (r *VehicleRepository) GetDeviceRegistry(orgID string) ([]model.DeviceRegistryEntry, error) {
	rows, err := r.db.Query(`
		SELECT d.id, d.device_uid, d.mqtt_client_id, COALESCE(d.name, ''), d.status,
		       COALESCE(v.organization_id::text, ''), COALESCE(v.plate, ''), d.last_seen, cur.ver
		FROM devices d
		LEFT JOIN vehicles v ON v.device_id = d.id AND v.archived_at IS NULL
		LEFT JOIN LATERAL (
			SELECT ver FROM device_telemetry dt
			WHERE dt.device_uid = d.device_uid AND dt.ver IS NOT NULL
			ORDER BY received_at DESC LIMIT 1
		) cur ON TRUE
		WHERE (NULLIF($1,'')::uuid IS NULL OR v.organization_id = NULLIF($1,'')::uuid)
		ORDER BY d.device_uid`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.DeviceRegistryEntry{}
	for rows.Next() {
		var e model.DeviceRegistryEntry
		var lastSeen sql.NullTime
		var ver sql.NullString
		if err := rows.Scan(&e.ID, &e.DeviceUID, &e.ClientID, &e.Name, &e.Status,
			&e.OrganizationID, &e.VehiclePlate, &lastSeen, &ver); err != nil {
			return nil, err
		}
		if lastSeen.Valid {
			e.LastSeen = &lastSeen.Time
		}
		if ver.Valid {
			e.CurrentVersion = ver.String
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *VehicleRepository) GetDeviceFirmwareHistory(deviceUID int) ([]model.FirmwareHistoryEntry, error) {
	rows, err := r.db.Query(`
		SELECT id, version, result, created_at
		FROM device_firmware_history
		WHERE device_uid = $1
		ORDER BY created_at DESC`, deviceUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.FirmwareHistoryEntry{}
	for rows.Next() {
		var h model.FirmwareHistoryEntry
		if err := rows.Scan(&h.ID, &h.Version, &h.Result, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// RecordFirmwareHistory — лог факта обновления (вызывается OTA-сессией, KAN-32). result:
// pending при старте, success/rolled-back/failed по итогу (health-check §11).
func (r *VehicleRepository) RecordFirmwareHistory(deviceUID int, version, result string) error {
	if result == "" {
		result = "pending"
	}
	_, err := r.db.Exec(
		`INSERT INTO device_firmware_history (device_uid, version, result) VALUES ($1, $2, $3)`,
		deviceUID, version, result)
	return err
}
