-- Multilingual columns for sports
ALTER TABLE sports
  ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255),
  ADD COLUMN IF NOT EXISTS name_ru VARCHAR(255),
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description_uz TEXT,
  ADD COLUMN IF NOT EXISTS description_ru TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

-- Populate existing sports: current name → name_uz
UPDATE sports SET name_uz = name WHERE name_uz IS NULL;

-- Multilingual columns for test_protocols
ALTER TABLE test_protocols
  ADD COLUMN IF NOT EXISTS name_uz VARCHAR(255),
  ADD COLUMN IF NOT EXISTS name_ru VARCHAR(255),
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description_uz TEXT,
  ADD COLUMN IF NOT EXISTS description_ru TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

UPDATE test_protocols SET name_uz = name WHERE name_uz IS NULL;

-- Multilingual recommendation text
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS recommendation_uz TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_ru TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_en TEXT;
