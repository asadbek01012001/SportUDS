-- KAN-12: A/B-пара образов на версию (Confluence OTA_server §7.1). Прошивка линкуется под адрес
-- слота во флеш → на версию ДВА .bin: image_A и image_B. image_A = существующие bin/fw_size/fw_crc32
-- (mqtt-service читает их при передаче — НЕ трогаем). image_B — новые колонки. Сервер сверяет пару (§7.2).
ALTER TABLE firmwares
    ADD COLUMN IF NOT EXISTS image_b           BYTEA,    -- .bin под слот B (NULL у legacy single-image)
    ADD COLUMN IF NOT EXISTS fw_size_b         INTEGER,  -- размер image_B, байт
    ADD COLUMN IF NOT EXISTS fw_crc32_b        BIGINT,   -- whole-image CRC-32/ISO-HDLC образа B (uint32)
    ADD COLUMN IF NOT EXISTS pair_check        TEXT,     -- ok | failed | pending | NULL (legacy single)
    ADD COLUMN IF NOT EXISTS pair_check_detail TEXT;     -- человекочитаемая причина результата сверки

-- Статус-жизненный цикл draft → beta → stable → deprecated (§3.2). Legacy 'released' → 'stable'.
UPDATE firmwares SET status = 'stable' WHERE status = 'released';
