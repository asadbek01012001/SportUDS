ALTER TABLE devices
    DROP COLUMN IF EXISTS ota_version,
    DROP COLUMN IF EXISTS ota_info_at;
