-- ============================================================
-- EnergoLink baseline schema (snapshot of init.sql as of 2026-05-14)
-- Idempotent — может применяться повторно без ошибок.
-- Seed-данные вынесены в 000002_seed.up.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50) NOT NULL DEFAULT 'dispatcher'
                  CHECK (role IN ('superadmin','admin','manager','dispatcher')),
    status        VARCHAR(50) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
    last_login    TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== DRIVERS ====================
CREATE TABLE IF NOT EXISTS drivers (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name        VARCHAR(255) NOT NULL,
    phone            VARCHAR(50)  NOT NULL,
    birth_date       DATE,
    license_number   VARCHAR(100),
    license_expiry   DATE,
    experience_years INTEGER NOT NULL DEFAULT 0,
    address          VARCHAR(500),
    notes            TEXT,
    rating           DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    trips            INTEGER NOT NULL DEFAULT 0,
    status           VARCHAR(50) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','vacation','sick')),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== DEVICES ====================
CREATE TABLE IF NOT EXISTS devices (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_uid INTEGER UNIQUE NOT NULL,
    name       VARCHAR(255),
    status     VARCHAR(50) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
    last_seen  TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== VEHICLES ====================
CREATE TABLE IF NOT EXISTS vehicles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate            VARCHAR(50) UNIQUE NOT NULL,
    brand            VARCHAR(100),
    model            VARCHAR(100) NOT NULL,
    manufacture_year INTEGER,
    color            VARCHAR(100),
    vin              VARCHAR(50),
    fuel_type        VARCHAR(50) DEFAULT 'diesel'
                     CHECK (fuel_type IN ('petrol','diesel','gas','electric','hybrid')),
    capacity         VARCHAR(100),
    status           VARCHAR(50) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','maintenance','stopped')),
    device_id        UUID REFERENCES devices(id) ON DELETE SET NULL,
    fuel             INTEGER NOT NULL DEFAULT 100 CHECK (fuel >= 0 AND fuel <= 100),
    mileage          INTEGER NOT NULL DEFAULT 0,
    last_service     DATE,
    lat              DECIMAL(10,6),
    lng              DECIMAL(10,6),
    speed            INTEGER DEFAULT 0,
    heading          INTEGER DEFAULT 0,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== TRIPS ====================
CREATE TABLE IF NOT EXISTS trips (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id   UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id    UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    route        VARCHAR(500) NOT NULL,
    fuel_used    VARCHAR(50),
    status       VARCHAR(50) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','completed','delayed')),
    started_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== NOTIFICATIONS ====================
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type       VARCHAR(50) NOT NULL CHECK (type IN ('warning','info','error')),
    title      VARCHAR(255) NOT NULL,
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== SETTINGS ====================
CREATE TABLE IF NOT EXISTS settings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    singleton     BOOLEAN UNIQUE DEFAULT TRUE,
    company_name  VARCHAR(255) NOT NULL DEFAULT 'Titan IT',
    contact_email VARCHAR(255) NOT NULL DEFAULT 'admin@gaslink.com',
    phone         VARCHAR(50)  DEFAULT '+998 90 000 00 00',
    timezone      VARCHAR(100) DEFAULT 'Tashkent (UTC+5)',
    speed_violation_alert BOOLEAN DEFAULT TRUE,
    geofence_exit_alert   BOOLEAN DEFAULT TRUE,
    low_fuel_alert        BOOLEAN DEFAULT TRUE,
    maintenance_alert     BOOLEAN DEFAULT FALSE,
    shift_alert           BOOLEAN DEFAULT FALSE,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== DEVICE TELEMETRY ====================
CREATE TABLE IF NOT EXISTS device_telemetry (
    id          BIGSERIAL PRIMARY KEY,
    device_uid  INTEGER NOT NULL,
    flow        DECIMAL(12,4),
    pressure    DECIMAL(10,4),
    lat         DECIMAL(12,8),
    lon         DECIMAL(12,8),
    temperature DECIMAL(8,4),
    speed       DECIMAL(8,4),
    course      DECIMAL(8,4),
    gnss_fix    BOOLEAN DEFAULT FALSE,
    device_time TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== CLAIMS ====================
CREATE TABLE IF NOT EXISTS claims (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    label       VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order  INTEGER DEFAULT 0
);

-- ==================== ROLE CLAIMS ====================
CREATE TABLE IF NOT EXISTS role_claims (
    role       VARCHAR(50)  NOT NULL,
    claim_name VARCHAR(100) NOT NULL REFERENCES claims(name) ON DELETE CASCADE,
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (role, claim_name)
);

-- ==================== INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_drivers_status       ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_status      ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate       ON vehicles(plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_device      ON vehicles(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_uid          ON devices(device_uid);
CREATE INDEX IF NOT EXISTS idx_trips_status         ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle        ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver         ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read   ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_date   ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_uid ON device_telemetry(device_uid);
CREATE INDEX IF NOT EXISTS idx_telemetry_date       ON device_telemetry(received_at DESC);
