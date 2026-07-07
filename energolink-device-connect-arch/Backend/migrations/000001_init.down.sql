-- Откат baseline — DROP в FK-обратном порядке.
-- ВНИМАНИЕ: уничтожает все данные. Только для локальной разработки.

DROP TABLE IF EXISTS role_claims;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS device_telemetry;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS users;

-- uuid-ossp оставляем — extension может использоваться другими БД на инстансе
