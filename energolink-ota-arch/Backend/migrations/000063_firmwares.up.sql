-- KAN-29/30: репозиторий прошивок OTA (Confluence 12_ota_server §4). .bin хранится в БД (bytea,
-- ≤64 КБ — слот A/B). При загрузке сервер сам считает fw_size + fw_crc32 (CRC-32/ISO-HDLC).
CREATE TABLE IF NOT EXISTS firmwares (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ver_major     INTEGER NOT NULL,
    ver_minor     INTEGER NOT NULL,
    target        TEXT NOT NULL,                  -- тип устройства: STM32F401 / F411 (+модем)
    fw_size       INTEGER NOT NULL,               -- размер .bin, байт (≤ 65536)
    fw_crc32      BIGINT  NOT NULL,               -- whole-image CRC-32/ISO-HDLC (uint32)
    bin           BYTEA   NOT NULL,               -- сам .bin
    signature     BYTEA,                          -- подпись образа (поле под будущее, §14)
    release_notes TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',  -- draft / released / deprecated
    channel       TEXT NOT NULL DEFAULT 'stable', -- stable / beta
    uploaded_by   TEXT,                           -- кто загрузил (user id, аудит)
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ver_major, ver_minor, target)
);
CREATE INDEX IF NOT EXISTS idx_firmwares_target ON firmwares(target);
