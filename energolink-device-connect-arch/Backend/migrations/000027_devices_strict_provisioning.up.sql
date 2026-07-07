-- ============================================================
-- Plan B (research v2): strict device pre-registration.
-- Чистит тестовые devices + расширяет схему под per-device mqtt_client_id,
-- device_type и обязательную привязку к организации.
--
-- Зависимости вниз по FK:
--   device_telemetry      — нет FK, чистим явно (связь через device_uid)
--   device_assignments        — ON DELETE CASCADE, авточистка
--   vehicles.device_id    — ON DELETE SET NULL, авточистка
-- ============================================================

-- 1) Очистка тестовых данных (пользователь подтвердил «коннекты можно удалить»).
DELETE FROM device_telemetry;
DELETE FROM devices;

-- 2) Новые колонки: внешний MQTT-идентификатор + тип устройства.
ALTER TABLE devices
  ADD COLUMN mqtt_client_id VARCHAR(64) NOT NULL UNIQUE,
  ADD COLUMN device_type    VARCHAR(20) NOT NULL
    CHECK (device_type IN ('lte','serial'));

-- 3) Расширение статусов: 'suspended' (admin временно выключил) и 'archived' (soft-delete).
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('active','inactive','suspended','archived'));

-- 4) Привязка к организации — обязательна. Default снимаем.
ALTER TABLE devices
  ALTER COLUMN organization_id DROP DEFAULT,
  ALTER COLUMN organization_id SET NOT NULL;

-- 5) CHECK pattern для client_id (дублирует API-валидацию в handler'е,
--    защищает от прямого SQL и багов в API-слое).
ALTER TABLE devices ADD CONSTRAINT devices_mqtt_client_id_pattern
  CHECK (
    (device_type = 'lte'    AND mqtt_client_id ~ '^lte-\d{15}$')
    OR
    (device_type = 'serial' AND mqtt_client_id ~ '^device-[A-Za-z0-9-]{1,50}$')
  );

-- 6) Индекс для DB-driven ACL look-up (Plan D mosquitto-go-auth) +
--    для mqtt-service strict-mode lookup'а (Plan C).
CREATE INDEX IF NOT EXISTS idx_devices_mqtt_client_id ON devices(mqtt_client_id);
