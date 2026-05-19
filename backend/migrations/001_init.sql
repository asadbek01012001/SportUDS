-- SportUDS Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles enum
CREATE TYPE user_role AS ENUM ('admin', 'researcher', 'coach', 'operator', 'athlete');
CREATE TYPE gender_type AS ENUM ('male', 'female');
CREATE TYPE training_context AS ENUM ('pre_load', 'post_load', 'diagnostic', 'stage_monitoring');
CREATE TYPE session_status AS ENUM ('pending', 'in_progress', 'completed', 'validated');

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'operator',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sports
CREATE TABLE IF NOT EXISTS sports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
  coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Athletes
CREATE TABLE IF NOT EXISTS athletes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(255) NOT NULL,
  birth_date DATE NOT NULL,
  gender gender_type NOT NULL,
  sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
  qualification VARCHAR(100),
  weight_category VARCHAR(50),
  experience_years INTEGER,
  training_stage VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test Protocols
CREATE TABLE IF NOT EXISTS test_protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  test_type VARCHAR(100) NOT NULL,
  description TEXT,
  initial_position VARCHAR(255),
  joint_angle NUMERIC(5,2),
  execution_mode VARCHAR(100),
  attempts_count INTEGER DEFAULT 3,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test Sessions
CREATE TABLE IF NOT EXISTS test_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES test_protocols(id) ON DELETE RESTRICT,
  operator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  training_context training_context NOT NULL DEFAULT 'diagnostic',
  body_weight NUMERIC(6,2),
  heart_rate INTEGER,
  subjective_state INTEGER CHECK (subjective_state BETWEEN 1 AND 10),
  notes TEXT,
  status session_status NOT NULL DEFAULT 'pending',
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Raw Sensor Data
CREATE TABLE IF NOT EXISTS raw_sensor_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  time_ms NUMERIC(10,2)[],
  force_values NUMERIC(10,4)[],
  displacement_values NUMERIC(10,4)[],
  sampling_rate INTEGER DEFAULT 1000,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Calculated Indicators (UDS formulas)
CREATE TABLE IF NOT EXISTS calculated_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  p0_max_isometric NUMERIC(10,4),       -- P₀ max voluntary isometric force
  f_max NUMERIC(10,4),                   -- Fmax - max explosive force
  t_max NUMERIC(10,4),                   -- tmax - time to max force (ms)
  j_speed_strength_index NUMERIC(10,4),  -- J = Fmax / tmax
  q_start_force NUMERIC(10,4),           -- Q = 0.5*Fmax / t1
  g_accelerating_force NUMERIC(10,4),    -- G = 0.5*Fmax / t2
  t1_ms NUMERIC(10,4),                   -- t1 - time to 0.5*Fmax
  t2_ms NUMERIC(10,4),                   -- t2 - time from 0.5*Fmax to Fmax
  v_max NUMERIC(10,4),                   -- Vmax = S(Fmax)/tmax
  n_max NUMERIC(10,4),                   -- Nmax = Fmax * Vmax
  v_q NUMERIC(10,4),                     -- VQ = S(Q)/t1
  n_q NUMERIC(10,4),                     -- N(Q) = 0.5*Fmax * V(Q)
  v_g NUMERIC(10,4),                     -- VG = S(G)/t2
  n_g NUMERIC(10,4),                     -- N(G) = 0.5*Fmax * V(G)
  is_best_attempt BOOLEAN DEFAULT FALSE,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training Loads
CREATE TABLE IF NOT EXISTS training_loads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  load_date DATE NOT NULL,
  microcycle INTEGER,
  mesocycle INTEGER,
  macrocycle INTEGER,
  load_type VARCHAR(100),
  load_description TEXT,
  intensity_level INTEGER CHECK (intensity_level BETWEEN 1 AND 10),
  volume_hours NUMERIC(5,2),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Recommendations
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  session_id UUID REFERENCES test_sessions(id) ON DELETE SET NULL,
  recommendation_text TEXT NOT NULL,
  indicators_basis JSONB,
  recommendation_type VARCHAR(100),
  ai_confidence NUMERIC(5,2),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  athlete_id UUID REFERENCES athletes(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  date_from DATE,
  date_to DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  file_path VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_athletes_sport ON athletes(sport_id);
CREATE INDEX IF NOT EXISTS idx_athletes_coach ON athletes(coach_id);
CREATE INDEX IF NOT EXISTS idx_athletes_team ON athletes(team_id);
CREATE INDEX IF NOT EXISTS idx_sessions_athlete ON test_sessions(athlete_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON test_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_indicators_session ON calculated_indicators(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER athletes_updated_at BEFORE UPDATE ON athletes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON test_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protocols_updated_at BEFORE UPDATE ON test_protocols FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default sports
INSERT INTO sports (name, description) VALUES
  ('Kurash', 'O''zbek milliy kurashi'),
  ('Judo', 'Judo sport turi'),
  ('Og''ir atletika', 'Og''ir atletika'),
  ('Boks', 'Boks sport turi'),
  ('Erkin kurash', 'Erkin kurash'),
  ('Klassik kurash', 'Klassik kurash'),
  ('Yengil atletika', 'Yengil atletika'),
  ('Gimnastika', 'Sport gimnastikasi')
ON CONFLICT (name) DO NOTHING;
