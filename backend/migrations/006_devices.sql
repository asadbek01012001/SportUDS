-- 006_devices.sql — IoT qurilmalar (trenajorlarga biriktirilgan) va telemetriya
-- energolink device-connect arxitekturasidan moslashtirilgan (mqtt-service shu jadvallarni ishlatadi).

-- Qurilmalar: har bir trenajor (machine) ga biriktiriladigan MQTT qurilma.
-- device_uid — telemetriya payloadidagi raqamli id (strict anti-spoofing lookup uchun).
-- mqtt_client_id — Mosquitto Dynamic Security'dagi username (per-device akkaunt).
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_uid BIGINT UNIQUE NOT NULL,
  machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
  mqtt_client_id VARCHAR(128) UNIQUE NOT NULL,
  mqtt_password VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive', 'active', 'disabled')),
  ota_version VARCHAR(64),                 -- qurilmaning joriy proshivka versiyasi (OTA/info'dan)
  ota_info_at TIMESTAMP WITH TIME ZONE,    -- oxirgi OTA/info qabul qilingan vaqt
  last_seen TIMESTAMP WITH TIME ZONE,      -- oxirgi telemetriya qabul qilingan vaqt
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_machine ON devices(machine_id);
CREATE INDEX IF NOT EXISTS idx_devices_client  ON devices(mqtt_client_id);

-- Trenajor telemetriyasi: qurilmalardan keladigan xom o'lchov oqimi.
-- payload — to'liq JSON (kelajakdagi/nostandart sensor maydonlari audit uchun saqlanadi).
CREATE TABLE IF NOT EXISTS machine_telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_uid BIGINT NOT NULL,
  bar_cm NUMERIC(8,2),
  weight_kg NUMERIC(8,2),
  reps INTEGER,
  speed NUMERIC(8,3),
  heart_rate INTEGER,
  ver VARCHAR(64),
  payload JSONB,
  device_time TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_machine_telemetry_device
  ON machine_telemetry(device_uid, received_at DESC);

-- updated_at trigger (update_updated_at() 001_init.sql'da yaratilgan).
DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
