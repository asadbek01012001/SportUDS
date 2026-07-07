-- KAN-10: версия прошивки/протокола устройства в телеметрии. Legacy-приборы поле ver не шлют
-- (NULL = legacy); новые шлют число/строку. Нужно для корректного разруливания смешанного парка.
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS ver TEXT;
