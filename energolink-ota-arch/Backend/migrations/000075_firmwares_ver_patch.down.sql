ALTER TABLE firmwares DROP CONSTRAINT IF EXISTS firmwares_ver_unique;
ALTER TABLE firmwares ADD CONSTRAINT firmwares_ver_major_ver_minor_target_key UNIQUE (ver_major, ver_minor, target);
ALTER TABLE firmwares DROP COLUMN IF EXISTS ver_patch;
