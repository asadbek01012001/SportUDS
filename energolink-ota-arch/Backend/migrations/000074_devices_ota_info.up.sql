-- KAN-43 v12 §11: версия прошивки теперь в OTA/info (retained), НЕ в телеметрии (коммент 10137 п.2).
-- Сервер ловит её из devices/<id>/OTA/info и хранит здесь — источник истины для health-check §11
-- (success/rolled-back определяет сервер, сравнивая текущую версию устройства с отправленной).
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS ota_version TEXT,                 -- текущая версия прошивки из OTA/info
    ADD COLUMN IF NOT EXISTS ota_info_at TIMESTAMPTZ;          -- когда OTA/info последний раз получен
