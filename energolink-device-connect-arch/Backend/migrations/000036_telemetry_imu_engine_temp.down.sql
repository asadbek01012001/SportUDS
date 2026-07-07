ALTER TABLE device_telemetry
    DROP COLUMN IF EXISTS engine_temperature,
    DROP COLUMN IF EXISTS accel_x,
    DROP COLUMN IF EXISTS accel_y,
    DROP COLUMN IF EXISTS accel_z,
    DROP COLUMN IF EXISTS gyro_x,
    DROP COLUMN IF EXISTS gyro_y,
    DROP COLUMN IF EXISTS gyro_z;
