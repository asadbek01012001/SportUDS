package ota

import (
	"fmt"
	"time"
)

// healthcheck.go — завершение жизненного цикла OTA-сессии (§8/§11, KAN-34/37/43). Сессия в статусе
// applying подтверждается по ИЗМЕНЕНИЮ версии устройства: успех = devices.ota_version (из OTA/info
// после reset) отличается от pre-OTA baseline (ota_sessions.pre_ota_version, зафиксирован при offer).
// Версии в cmd ("0.2") и OTA/info ("0.0.900") в разных форматах (коммент Elbek), поэтому сравниваем
// ФАКТ изменения, а не строку. Нет изменения за rollbackAfter → rolled-back. Чисто серверный.

// HealthResult — итог одного прогона.
type HealthResult struct {
	Confirmed  int64 // applying → success
	RolledBack int64 // applying → rolled-back (версия не подтверждена в срок)
}

// RunHealthCheck продвигает applying-сессии по телеметрии. rollbackAfter — сколько ждать подтверждения.
func (s *Store) RunHealthCheck(rollbackAfter time.Duration) (HealthResult, error) {
	var res HealthResult

	// 1) applying → success: устройство переиздало OTA/info с ИЗМЕНЁННОЙ версией относительно
	// pre-OTA baseline (новая != прежней). Форматы версий в cmd ("0.2") и OTA/info ("0.0.900")
	// различаются (коммент Elbek), поэтому успех определяем по ФАКТУ изменения версии (устройство
	// ожило и применило новую прошивку), а не по точному совпадению строки.
	r1, err := s.db.Exec(`
		UPDATE ota_sessions s SET status='success', updated_at=NOW()
		FROM devices d
		WHERE s.status='applying' AND d.device_uid = s.device_uid
		  AND d.ota_version IS NOT NULL AND d.ota_version <> ''
		  AND d.ota_version IS DISTINCT FROM s.pre_ota_version`)
	if err != nil {
		return res, fmt.Errorf("ota: healthcheck success: %w", err)
	}
	res.Confirmed, _ = r1.RowsAffected()

	// 2) applying → rolled-back: за rollbackAfter версия не изменилась (откат на старую или нет связи).
	r2, err := s.db.Exec(`
		UPDATE ota_sessions SET status='rolled-back',
		       error='health-check: версия не подтверждена (откат или нет связи)', updated_at=NOW()
		WHERE status='applying' AND updated_at < NOW() - ($1 * INTERVAL '1 second')`,
		rollbackAfter.Seconds())
	if err != nil {
		return res, fmt.Errorf("ota: healthcheck rollback: %w", err)
	}
	res.RolledBack, _ = r2.RowsAffected()

	// 3) Синхронизируем историю прошивок: pending → терминальный статус сессии.
	if res.Confirmed > 0 || res.RolledBack > 0 {
		if err := s.syncFirmwareHistory(); err != nil {
			return res, err
		}
	}
	return res, nil
}

// ConfirmApplyingByClientID — event-driven подтверждение успеха СРАЗУ при получении OTA/info
// (§11, коммент Elbek 29.06): после прошивки устройство немедленно переподключается и переиздаёт
// OTA/info с новой версией — сервер обязан узнать об успехе в тот же момент, а не ждать тика
// периодического health-check (до 5 мин задержки). Scoped по mqtt_client_id одного устройства.
// Критерий успеха тот же, что в RunHealthCheck: версия изменилась относительно pre_ota_version
// (retained OTA/info при рестарте сервиса несёт прежнюю версию → IS DISTINCT FROM ложно → no-op).
func (s *Store) ConfirmApplyingByClientID(clientID string) (HealthResult, error) {
	var res HealthResult
	r1, err := s.db.Exec(`
		UPDATE ota_sessions s SET status='success', updated_at=NOW()
		FROM devices d
		WHERE s.status='applying' AND d.device_uid = s.device_uid
		  AND d.mqtt_client_id = $1
		  AND d.ota_version IS NOT NULL AND d.ota_version <> ''
		  AND d.ota_version IS DISTINCT FROM s.pre_ota_version`, clientID)
	if err != nil {
		return res, fmt.Errorf("ota: confirm applying %s: %w", clientID, err)
	}
	res.Confirmed, _ = r1.RowsAffected()
	if res.Confirmed > 0 {
		if err := s.syncFirmwareHistory(); err != nil {
			return res, err
		}
	}
	return res, nil
}

// syncFirmwareHistory переносит pending-записи истории прошивок в терминальный статус сессии
// (success/rolled-back). Идемпотентна; общая для периодического и event-driven подтверждения.
func (s *Store) syncFirmwareHistory() error {
	if _, err := s.db.Exec(`
		UPDATE device_firmware_history h SET result = s.status
		FROM ota_sessions s, firmwares f
		WHERE s.firmware_id = f.id AND h.device_uid = s.device_uid
		  AND h.version = (f.ver_major::text || '.' || f.ver_minor::text)
		  AND h.result = 'pending' AND s.status IN ('success','rolled-back')`); err != nil {
		return fmt.Errorf("ota: healthcheck history sync: %w", err)
	}
	return nil
}
