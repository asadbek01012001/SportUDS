package repository

import (
	"database/sql"

	"github.com/energolink/vehicle-service/internal/model"
)

// ota_rollout.go — массовая раскатка прошивки на организацию (§5/§14). Кампания создаёт таргеты
// по всем устройствам орг.; воркер (см. handler/rollout_worker) назначает их ПО ОЧЕРЕДИ через
// mqtt-service (single-active слот, миграция 066). Прогресс — агрегат статусов таргетов.

// CreateRollout создаёт кампанию + таргеты (все устройства орг. с привязанным device_uid).
// Возвращает id кампании и число таргетов.
func (r *VehicleRepository) CreateRollout(orgID, firmwareID, level, createdBy string) (string, int, error) {
	if level == "" {
		level = "normal"
	}
	tx, err := r.db.Begin()
	if err != nil {
		return "", 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	var rolloutID string
	if err := tx.QueryRow(
		`INSERT INTO ota_rollouts (organization_id, firmware_id, level, created_by)
		 VALUES ($1::uuid, $2::uuid, $3, $4) RETURNING id`,
		orgID, firmwareID, level, createdBy,
	).Scan(&rolloutID); err != nil {
		return "", 0, err
	}

	res, err := tx.Exec(
		`INSERT INTO ota_rollout_targets (rollout_id, device_uid)
		 SELECT $1::uuid, d.device_uid
		 FROM devices d
		 JOIN vehicles v ON v.device_id = d.id AND v.archived_at IS NULL
		 WHERE v.organization_id = $2::uuid AND d.device_uid IS NOT NULL`,
		rolloutID, orgID,
	)
	if err != nil {
		return "", 0, err
	}
	n, _ := res.RowsAffected()
	if err := tx.Commit(); err != nil {
		return "", 0, err
	}
	return rolloutID, int(n), nil
}

// ListRollouts — кампании org-scope с агрегатом прогресса.
func (r *VehicleRepository) ListRollouts(orgID string) ([]model.Rollout, error) {
	rows, err := r.db.Query(`
		SELECT ro.id, ro.organization_id::text, COALESCE(o.name, ''),
		       (f.ver_major::text || '.' || f.ver_minor::text), ro.level, ro.status, ro.created_at,
		       COUNT(t.id), COUNT(*) FILTER (WHERE t.status = 'success'),
		       COUNT(*) FILTER (WHERE t.status = 'failed'),
		       COUNT(*) FILTER (WHERE t.status IN ('success','failed'))
		FROM ota_rollouts ro
		JOIN firmwares f ON f.id = ro.firmware_id
		LEFT JOIN organizations o ON o.id = ro.organization_id
		LEFT JOIN ota_rollout_targets t ON t.rollout_id = ro.id
		WHERE (NULLIF($1,'')::uuid IS NULL OR ro.organization_id = NULLIF($1,'')::uuid)
		GROUP BY ro.id, o.name, f.ver_major, f.ver_minor
		ORDER BY ro.created_at DESC LIMIT 100`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Rollout{}
	for rows.Next() {
		var ro model.Rollout
		if err := rows.Scan(&ro.ID, &ro.OrganizationID, &ro.OrganizationName, &ro.Version,
			&ro.Level, &ro.Status, &ro.CreatedAt, &ro.Total, &ro.Success, &ro.Failed, &ro.Done); err != nil {
			return nil, err
		}
		out = append(out, ro)
	}
	return out, rows.Err()
}

// ── Воркер-хелперы ───────────────────────────────────────────────────────────

// HasActiveOtaSession — есть ли offered/downloading сессия (single-active слот занят).
func (r *VehicleRepository) HasActiveOtaSession() (bool, error) {
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM ota_sessions WHERE status IN ('offered','downloading')`).Scan(&n)
	return n > 0, err
}

// RolloutNextTarget — самый старый pending-таргет работающей кампании (FIFO). nil-строки если нет.
func (r *VehicleRepository) RolloutNextTarget() (rolloutID string, deviceUID int, firmwareID string, ok bool, err error) {
	row := r.db.QueryRow(`
		SELECT t.rollout_id::text, t.device_uid, ro.firmware_id::text
		FROM ota_rollout_targets t
		JOIN ota_rollouts ro ON ro.id = t.rollout_id AND ro.status = 'running'
		WHERE t.status = 'pending'
		ORDER BY ro.created_at, t.id LIMIT 1`)
	err = row.Scan(&rolloutID, &deviceUID, &firmwareID)
	if err == sql.ErrNoRows {
		return "", 0, "", false, nil
	}
	if err != nil {
		return "", 0, "", false, err
	}
	return rolloutID, deviceUID, firmwareID, true, nil
}

// MarkTargetSent помечает таргет назначенным (после успешного StartOTA).
func (r *VehicleRepository) MarkTargetSent(rolloutID string, deviceUID int) error {
	_, err := r.db.Exec(
		`UPDATE ota_rollout_targets SET status='sent', updated_at=NOW()
		 WHERE rollout_id=$1::uuid AND device_uid=$2 AND status='pending'`, rolloutID, deviceUID)
	return err
}

// ReconcileRolloutTargets — sent-таргеты → success/failed по истории прошивок устройства
// (device_firmware_history результата health-check), и завершает кампании без pending/sent.
func (r *VehicleRepository) ReconcileRolloutTargets() error {
	// sent → терминальный по последней истории прошивок целевой версии. Подзапрос ссылается на
	// t2 (обычная FROM-таблица), а не на целевую t — иначе Postgres: «invalid reference to ... t».
	if _, err := r.db.Exec(`
		UPDATE ota_rollout_targets t SET status = sub.result, updated_at = NOW()
		FROM (
		    SELECT t2.id, h.result
		    FROM ota_rollout_targets t2
		    JOIN ota_rollouts ro ON ro.id = t2.rollout_id
		    JOIN firmwares  f  ON f.id  = ro.firmware_id
		    JOIN LATERAL (
		        SELECT result FROM device_firmware_history dh
		        WHERE dh.device_uid = t2.device_uid
		          AND dh.version = (f.ver_major::text || '.' || f.ver_minor::text)
		        ORDER BY dh.created_at DESC LIMIT 1
		    ) h ON TRUE
		    WHERE t2.status = 'sent' AND h.result IN ('success','failed','rolled-back')
		) sub
		WHERE t.id = sub.id`); err != nil {
		return err
	}
	// rolled-back трактуем как failed для агрегата.
	if _, err := r.db.Exec(`UPDATE ota_rollout_targets SET status='failed' WHERE status='rolled-back'`); err != nil {
		return err
	}
	// Кампания завершена, когда нет pending/sent таргетов.
	_, err := r.db.Exec(`
		UPDATE ota_rollouts ro SET status='completed', updated_at=NOW()
		WHERE ro.status='running'
		  AND NOT EXISTS (SELECT 1 FROM ota_rollout_targets t WHERE t.rollout_id=ro.id AND t.status IN ('pending','sent'))`)
	return err
}
