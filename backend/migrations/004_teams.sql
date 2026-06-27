-- Teams: filial (zal) bilan ixtiyoriy bog'lanish
ALTER TABLE teams ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES halls(id) ON DELETE SET NULL;

-- Jamoa ↔ trener: ko'p-ko'p (bitta jamoada bir nechta trener bo'lishi mumkin)
CREATE TABLE IF NOT EXISTS team_coaches (
  team_id  UUID NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (team_id, coach_id)
);

-- Eski teams.coach_id qiymatlarini join jadvalga ko'chirish
INSERT INTO team_coaches (team_id, coach_id)
SELECT id, coach_id FROM teams WHERE coach_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_team_coaches_coach ON team_coaches(coach_id);
CREATE INDEX IF NOT EXISTS idx_team_coaches_team  ON team_coaches(team_id);

-- Namuna jamolar (agar bo'lmasa)
INSERT INTO teams (name, sport_id, description)
SELECT 'Og''ir atletika terma jamoasi', s.id, 'Kattalar terma jamoasi'
FROM sports s WHERE s.name = 'Og''ir atletika'
AND NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Og''ir atletika terma jamoasi');
