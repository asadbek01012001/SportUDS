-- 009_firmwares_meta.sql — firmware repozitoriysi metadatasi (energolink ota-arch dan port).
-- 007_ota.sql firmwares jadvalini yaratgan (bin, fw_crc32, image_b, fw_crc32_b). Bu yerda REST
-- yuklash/boshqarish endpointi uchun zarur qo'shimcha maydonlarni qo'shamiz: server .bin qabul
-- qilganda o'zi hisoblaydigan o'lcham + A/B juftlik sverkasi natijasi + audit maydonlari.

ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS fw_size            INTEGER;      -- image_A o'lchami (bayt)
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS fw_size_b          INTEGER;      -- image_B o'lchami (juft bo'lsa)
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS release_notes      TEXT;
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS uploaded_by        UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS pair_check         VARCHAR(20);  -- ok | failed | pending | NULL (legacy single)
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS pair_check_detail  TEXT;

-- Bir target uchun bir xil major.minor.patch versiya faqat bitta bo'lishi kerak (dublikat yuklashni
-- 409 sifatida rad etamiz). target NULL bo'lsa COALESCE bilan bo'sh satrga normallashtiramiz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_firmwares_ver_target
  ON firmwares (ver_major, ver_minor, ver_patch, COALESCE(target, ''));
