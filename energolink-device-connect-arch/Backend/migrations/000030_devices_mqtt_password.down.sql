DROP INDEX IF EXISTS idx_dca_actor;
DROP INDEX IF EXISTS idx_dca_device;
DROP TABLE IF EXISTS device_credential_audit;
ALTER TABLE devices
  DROP COLUMN IF EXISTS legacy_shared_creds,
  DROP COLUMN IF EXISTS mqtt_password_encrypted;
