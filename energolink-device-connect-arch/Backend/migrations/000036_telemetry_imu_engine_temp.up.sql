-- Add engine temperature + IMU (6-axis) columns to device_telemetry.
-- ТЗ 6_hardware: DS18B20 (engine), BMI270 (accel+gyro).
-- NULLable: legacy devices without these sensors → NULL, not 0.

ALTER TABLE device_telemetry
    ADD COLUMN IF NOT EXISTS engine_temperature DECIMAL(8,4),
    ADD COLUMN IF NOT EXISTS accel_x DECIMAL(8,4),
    ADD COLUMN IF NOT EXISTS accel_y DECIMAL(8,4),
    ADD COLUMN IF NOT EXISTS accel_z DECIMAL(8,4),
    ADD COLUMN IF NOT EXISTS gyro_x  DECIMAL(8,4),
    ADD COLUMN IF NOT EXISTS gyro_y  DECIMAL(8,4),
    ADD COLUMN IF NOT EXISTS gyro_z  DECIMAL(8,4);
