-- 007_ota.sql — OTA (havodan proshivka yuklash) sxemasi
-- energolink ota arxitekturasidan moslashtirilgan (mqtt-service ota paketi shu jadvallarni ishlatadi).

-- Proshivkalar repozitoriysi. A/B image juftligi (§7): bin = image_A (majburiy),
-- image_b = image_B (ixtiyoriy, single-image proshivkada NULL). fw_crc32 — whole-image CRC-32/ISO-HDLC.
CREATE TABLE IF NOT EXISTS firmwares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ver_major INTEGER NOT NULL,
  ver_minor INTEGER NOT NULL,
  ver_patch INTEGER NOT NULL DEFAULT 0,
  target VARCHAR(100),
  channel VARCHAR(20) NOT NULL DEFAULT 'stable',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'beta', 'stable')),
  fw_crc32 BIGINT NOT NULL,
  bin BYTEA NOT NULL,
  fw_crc32_b BIGINT,
  image_b BYTEA,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OTA sessiyalari (§8). pre_ota_version — offer paytidagi qurilma versiyasi (health-check
-- versiya o'zgarishini shunga nisbatan tekshiradi).
CREATE TABLE IF NOT EXISTS ota_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_uid BIGINT NOT NULL,
  firmware_id UUID NOT NULL REFERENCES firmwares(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'downloading', 'applying', 'success', 'failed', 'rolled-back')),
  pre_ota_version VARCHAR(64),
  current_seq INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ota_sessions_device ON ota_sessions(device_uid);

-- 066: qurilma bo'yicha bir vaqtda faqat BITTA aktiv sessiya (offered/downloading) — CreateSession
-- unique_violation'ni ErrActiveSession sifatida qaytaradi (bir parcha qurilmaga qayta-qayta
-- yangilanish tayinlanmasligi uchun).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ota_one_active
  ON ota_sessions(device_uid) WHERE status IN ('offered', 'downloading');

-- Qurilma proshivkalari tarixi (§5). result: pending → success/failed/rolled-back.
CREATE TABLE IF NOT EXISTS device_firmware_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_uid BIGINT NOT NULL,
  version VARCHAR(64) NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dfh_device ON device_firmware_history(device_uid);
