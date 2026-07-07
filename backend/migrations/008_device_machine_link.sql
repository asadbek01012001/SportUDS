-- 008_device_machine_link.sql — device ↔ trenajor 1:1 (ixtiyoriy) bog'liqligi.
-- Har trenajorda ko'pi bilan BITTA device bo'ladi; biriktirilmagan (machine_id IS NULL) device'lar
-- cheklovsiz. Postgres qisman unique indeksi: NULL qiymatlar unique'ga kirmaydi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_machine
  ON devices(machine_id) WHERE machine_id IS NOT NULL;
