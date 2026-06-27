-- Halls (zallar)
CREATE TABLE IF NOT EXISTS halls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Machines (trinajorlar)
CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  serial_number VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Machine sessions (QR orqali bog'langan seanlar)
CREATE TABLE IF NOT EXISTS machine_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES athletes(id) ON DELETE SET NULL,
  qr_token UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Measurements (real-time o'lchov ma'lumotlari)
CREATE TABLE IF NOT EXISTS measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES machine_sessions(id) ON DELETE CASCADE,
  bar_cm NUMERIC(6,2),
  weight_kg NUMERIC(6,2),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Athletes jadvaliga body_weight va height_cm qo'shish
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS body_weight NUMERIC(5,2);
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS height_cm  INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS region     VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_machine_sessions_token   ON machine_sessions(qr_token);
CREATE INDEX IF NOT EXISTS idx_machine_sessions_athlete ON machine_sessions(athlete_id);
CREATE INDEX IF NOT EXISTS idx_machine_sessions_machine ON machine_sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_measurements_session     ON measurements(session_id);
CREATE INDEX IF NOT EXISTS idx_measurements_recorded    ON measurements(recorded_at);

-- Default zallar
INSERT INTO halls (name, address) VALUES
  ('Yunusobod Sport Markazi',  'Yunusobod tumani, 5-mavze, 15-uy'),
  ('Chilonzor Olimpiya Zali',  'Chilonzor tumani, 9-kvartal'),
  ('Mirzo Ulugbek Sport Zali', 'Mirzo Ulugbek tumani, Universitet ko''chasi')
ON CONFLICT DO NOTHING;

-- Har zal uchun 3 ta mashina
INSERT INTO machines (hall_id, name, serial_number)
SELECT h.id, 'UDS #' || n, 'SN-00' || n || substr(h.id::text, 1, 4)
FROM halls h, generate_series(1,3) AS n
ON CONFLICT DO NOTHING;
