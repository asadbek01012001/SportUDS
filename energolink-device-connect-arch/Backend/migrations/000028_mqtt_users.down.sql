-- Откат миграции 28.
DROP INDEX IF EXISTS idx_mqtt_users_username;
DROP TABLE IF EXISTS mqtt_users;
