-- KAN-43: трёхкомпонентная версия прошивки major.minor.patch (напр. 4.3.1). HEADER §9.3 несёт
-- только ver_major/ver_minor (протокол фиксирован) — patch это метаданные репозитория для
-- различения сборок и отображения. Расширяем unique-ключ patch'ем.
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS ver_patch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE firmwares DROP CONSTRAINT IF EXISTS firmwares_ver_major_ver_minor_target_key;
ALTER TABLE firmwares ADD CONSTRAINT firmwares_ver_unique UNIQUE (ver_major, ver_minor, ver_patch, target);
