-- ============================================================
-- Откат миграции 27. Данные (тестовые devices/device_telemetry) НЕ
-- восстанавливаются — миграция была односторонней по данным (см. up).
-- ============================================================

DROP INDEX IF EXISTS idx_devices_mqtt_client_id;

ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_mqtt_client_id_pattern;

-- Restore старого статус CHECK (только active/inactive). Existing 'suspended'/'archived'
-- сбрасываются на 'inactive' — иначе CHECK не наложится.
UPDATE devices SET status = 'inactive' WHERE status IN ('suspended','archived');
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('active','inactive'));

-- Restore default + nullable на organization_id.
ALTER TABLE devices
  ALTER COLUMN organization_id DROP NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Drop new columns.
ALTER TABLE devices
  DROP COLUMN IF EXISTS mqtt_client_id,
  DROP COLUMN IF EXISTS device_type;
