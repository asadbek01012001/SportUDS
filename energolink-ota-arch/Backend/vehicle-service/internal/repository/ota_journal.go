package repository

import (
	"database/sql"

	"github.com/energolink/vehicle-service/internal/model"
)

// ota_journal.go — список OTA-сессий для вкладок «Журнал OTA» (§6) и «Мониторинг» (§7).
// Источник: ota_sessions + firmwares (отправленная версия) + devices/vehicles/organizations
// (кому) + telemetry.ver (реально запущенная версия по health-check §11). Org-scope через vehicles.

// ListOtaSessions возвращает последние OTA-сессии (≤200). orgID="" → все (superadmin).
func (r *VehicleRepository) ListOtaSessions(orgID string) ([]model.OtaSession, error) {
	rows, err := r.db.Query(`
		SELECT s.id, s.device_uid, COALESCE(d.mqtt_client_id, ''), COALESCE(v.plate, ''),
		       COALESCE(v.organization_id::text, ''), COALESCE(o.name, ''),
		       (f.ver_major::text || '.' || f.ver_minor::text) AS version,
		       COALESCE(cur.ver, ''), s.status, s.current_seq, s.frames_total, COALESCE(s.error, ''),
		       s.created_at, s.updated_at
		FROM ota_sessions s
		JOIN firmwares f ON f.id = s.firmware_id
		LEFT JOIN devices d ON d.device_uid = s.device_uid
		LEFT JOIN vehicles v ON v.device_id = d.id AND v.archived_at IS NULL
		LEFT JOIN organizations o ON o.id = v.organization_id
		LEFT JOIN LATERAL (
			SELECT ver FROM device_telemetry dt
			WHERE dt.device_uid = s.device_uid AND dt.ver IS NOT NULL
			ORDER BY received_at DESC LIMIT 1
		) cur ON TRUE
		WHERE (NULLIF($1,'')::uuid IS NULL OR v.organization_id = NULLIF($1,'')::uuid)
		ORDER BY s.updated_at DESC
		LIMIT 200`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.OtaSession{}
	for rows.Next() {
		var s model.OtaSession
		var launched, errMsg sql.NullString
		if err := rows.Scan(&s.ID, &s.DeviceUID, &s.ClientID, &s.VehiclePlate,
			&s.OrganizationID, &s.OrganizationName, &s.Version,
			&launched, &s.Status, &s.CurrentSeq, &s.FramesTotal, &errMsg,
			&s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		s.LaunchedVersion = launched.String
		s.Error = errMsg.String
		out = append(out, s)
	}
	return out, rows.Err()
}
