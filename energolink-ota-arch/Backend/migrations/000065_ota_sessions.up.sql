-- KAN-32: серверные OTA-сессии (Confluence 12_ota_server §8). Состояние передачи .bin на
-- устройство: offered → downloading → applying → success/failed. Создаётся при назначении
-- обновления (admin), забирается TCP-сервером при коннекте устройства (claim oldest offered).
CREATE TABLE IF NOT EXISTS ota_sessions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_uid   INTEGER NOT NULL,
    firmware_id  UUID NOT NULL REFERENCES firmwares(id),
    status       TEXT NOT NULL DEFAULT 'offered', -- offered/downloading/applying/success/failed
    current_seq  INTEGER NOT NULL DEFAULT 0,      -- последний подтверждённый DATA seq
    retries      INTEGER NOT NULL DEFAULT 0,
    frames_total INTEGER NOT NULL DEFAULT 0,      -- число DATA-фреймов в образе
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- claim берёт самую старую offered-сессию (FIFO).
CREATE INDEX IF NOT EXISTS idx_ota_sessions_offered ON ota_sessions(created_at) WHERE status = 'offered';
CREATE INDEX IF NOT EXISTS idx_ota_sessions_device ON ota_sessions(device_uid, created_at DESC);
