-- KAN-31: история прошивок по устройству (Confluence 12_ota_server §5). Какая версия, когда,
-- с каким результатом. Текущая версия берётся из телеметрии (device_telemetry.ver), здесь — лог.
CREATE TABLE IF NOT EXISTS device_firmware_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_uid  INTEGER NOT NULL,
    version     TEXT NOT NULL,                   -- "ver_major.ver_minor"
    result      TEXT NOT NULL DEFAULT 'pending', -- pending / success / rolled-back / failed
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dfh_device ON device_firmware_history(device_uid, created_at DESC);
