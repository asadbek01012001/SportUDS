-- ============================================================
-- Plan D (research v2): mqtt_users — таблица для mosquitto-go-auth плагина.
--
-- Хранит bcrypt-хэшированные кредсы для MQTT-аккаунтов. Используется
-- плагином через userCheckStatement на каждом CONNECT'е.
--
-- Роли (значение role):
--   device-publisher    — общий аккаунт для устройств (gaslink-mqtt).
--                         ACL: PUBLISH только в devices/<свой client_id>/telemetry,
--                         при условии что client_id зарегистрирован active в devices.
--   mqtt-collector      — service-account нашего mqtt-service.
--                         ACL: SUBSCRIBE на devices/+/telemetry (read-all).
--   admin-debug         — отладочный аккаунт (для mosquitto_sub/pub с агента).
--                         ACL: superuser bypass — может всё.
--
-- Seed данные подставляются отдельно после применения миграции (через
-- INSERT с сгенерированными bcrypt-хэшами реальных паролей из K8s Secret).
-- Миграция не содержит хэши паролей — миграционные файлы в публичном git.
--
-- NB: отдельная read-only PG роль не создаётся (Selectel DBaaS ограничивает
-- CREATEROLE для teresa). Плагин коннектится теми же `teresa` creds, что и
-- остальные сервисы. ACL queries — только SELECT, поэтому write-доступ
-- плагином не используется. Compensating control: mosquitto pod изолирован
-- в K8s + creds лежат в sealed-secret.
-- ============================================================

CREATE TABLE IF NOT EXISTS mqtt_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(64) NOT NULL UNIQUE,
    password_bcrypt VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL
                    CHECK (role IN ('device-publisher','mqtt-collector','admin-debug')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqtt_users_username ON mqtt_users(username);
