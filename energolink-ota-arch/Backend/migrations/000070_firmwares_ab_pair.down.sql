UPDATE firmwares SET status = 'released' WHERE status = 'stable';
ALTER TABLE firmwares
    DROP COLUMN IF EXISTS image_b,
    DROP COLUMN IF EXISTS fw_size_b,
    DROP COLUMN IF EXISTS fw_crc32_b,
    DROP COLUMN IF EXISTS pair_check,
    DROP COLUMN IF EXISTS pair_check_detail;
