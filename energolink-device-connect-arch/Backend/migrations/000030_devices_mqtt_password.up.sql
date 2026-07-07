-- Per-device MQTT credentials (Phase 3, plan tasks/mqtt/2026-05-18_1100--per-device-creds-dynsec--plan.md)
--
-- mqtt_password_encrypted — AES-256-GCM ciphertext (nonce + tag + payload),
--   ключ — MQTT_PASSWORD_ENC_KEY из dynsec-secrets.
-- legacy_shared_creds — для existing устройств, которые до миграции работали
--   под общим аккаунтом gaslink-mqtt; не имеют собственного пароля в DynSec,
--   продолжают подключаться через password_file. Новые устройства = false.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS mqtt_password_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS legacy_shared_creds BOOLEAN NOT NULL DEFAULT FALSE;

-- Все уже существующие устройства помечаем legacy — для них пароль брать
-- из общего gaslink-mqtt, до перепрошивки.
UPDATE devices SET legacy_shared_creds = TRUE WHERE mqtt_password_encrypted IS NULL;

-- Audit log: каждый reveal/rotate пароля фиксируется (кто, когда, для какого).
CREATE TABLE IF NOT EXISTS device_credential_audit (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action      VARCHAR(16) NOT NULL CHECK (action IN ('reveal', 'rotate', 'create', 'delete')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dca_device ON device_credential_audit(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dca_actor  ON device_credential_audit(actor_id, created_at DESC);
