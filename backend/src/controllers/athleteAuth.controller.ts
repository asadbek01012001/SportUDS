import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'sportuds_secret_2024';
const JWT_EXPIRES = '30d';

// Ro'yxatdan o'tish
export const registerAthlete = async (req: Request, res: Response) => {
  const { email, password, full_name, birth_date, gender, sport_name, body_weight, height_cm, region, team_id } = req.body;

  if (!email || !password || !full_name || !birth_date || !gender) {
    return res.status(400).json({ success: false, error: 'Majburiy maydonlar to\'ldirilmagan' });
  }

  try {
    // Email tekshirish
    const existing = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const hash = await bcrypt.hash(password, 10);

    // User yaratish
    const { rows: userRows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'athlete') RETURNING id`,
      [email, hash, full_name]
    );
    const userId = userRows[0].id;

    // Sport topish yoki qo'shish
    let sportId: string | null = null;
    if (sport_name) {
      const { rows: sRows } = await query(
        `INSERT INTO sports (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [sport_name]
      );
      sportId = sRows[0].id;
    }

    // Athlete yaratish (ro'yxatdan o'tishda jamoani o'zi tanlashi mumkin)
    const { rows: athRows } = await query(
      `INSERT INTO athletes (user_id, full_name, birth_date, gender, sport_id, body_weight, height_cm, region, team_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [userId, full_name, birth_date, gender, sportId, body_weight || null, height_cm || null, region || null, team_id || null]
    );

    const token = jwt.sign({ userId, athleteId: athRows[0].id, role: 'athlete' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      success: true,
      data: { token, athlete_id: athRows[0].id, user_id: userId, full_name, email }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Kirish
export const loginAthlete = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email va parol kerak' });
  }

  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.password_hash, a.id AS athlete_id
       FROM users u
       LEFT JOIN athletes a ON a.user_id = u.id
       WHERE u.email=$1 AND u.role='athlete' AND u.is_active=true`,
      [email]
    );
    if (!rows.length) return res.status(401).json({ success: false, error: 'Email yoki parol noto\'g\'ri' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Email yoki parol noto\'g\'ri' });

    const token = jwt.sign(
      { userId: user.id, athleteId: user.athlete_id, role: 'athlete' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({ success: true, data: { token, athlete_id: user.athlete_id, full_name: user.full_name, email: user.email } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Token tekshirish (auto-login)
export const verifyToken = async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false });

  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { athleteId: string; userId: string };

    const { rows } = await query(
      `SELECT a.id, a.full_name, a.birth_date, a.body_weight, a.height_cm, a.region,
              a.team_id, u.email, s.name AS sport_name, te.name AS team_name
       FROM athletes a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN sports s ON s.id = a.sport_id
       LEFT JOIN teams te ON te.id = a.team_id
       WHERE a.id=$1`,
      [decoded.athleteId]
    );
    if (!rows.length) return res.status(401).json({ success: false });
    res.json({ success: true, data: { ...rows[0], athlete_id: rows[0].id } });
  } catch {
    res.status(401).json({ success: false, error: 'Token yaroqsiz' });
  }
};

// Sportchi o'zining sessiya tarixini olish
export const getAthleteHistory = async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false });

  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { athleteId: string };

    const { rows } = await query(`
      SELECT ms.id, ms.started_at, ms.ended_at, ms.status,
             m.name AS machine_name, h.name AS hall_name,
             (SELECT bar_cm FROM measurements WHERE session_id=ms.id ORDER BY recorded_at DESC LIMIT 1) AS last_bar_cm,
             (SELECT weight_kg FROM measurements WHERE session_id=ms.id ORDER BY recorded_at DESC LIMIT 1) AS last_weight_kg,
             (SELECT MAX(bar_cm) FROM measurements WHERE session_id=ms.id) AS max_bar_cm,
             (SELECT MAX(weight_kg) FROM measurements WHERE session_id=ms.id) AS max_weight_kg,
             (SELECT COUNT(*) FROM measurements WHERE session_id=ms.id) AS measurement_count
      FROM machine_sessions ms
      JOIN machines m ON m.id = ms.machine_id
      JOIN halls h ON h.id = m.hall_id
      WHERE ms.athlete_id = $1 AND ms.status = 'completed'
      ORDER BY ms.started_at DESC
      LIMIT 50
    `, [decoded.athleteId]);

    res.json({ success: true, data: rows });
  } catch {
    res.status(401).json({ success: false, error: 'Token yaroqsiz' });
  }
};

// Sportchining jamoasi: jamoa, trenerlar va jamoadoshlari
export const getMyTeam = async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false });

  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { athleteId: string };

    const { rows: ath } = await query('SELECT team_id FROM athletes WHERE id=$1', [decoded.athleteId]);
    const teamId = ath[0]?.team_id;
    if (!teamId) return res.json({ success: true, data: null });

    const { rows: teamRows } = await query(
      `SELECT t.id, t.name, t.description, s.name AS sport_name, h.name AS hall_name
       FROM teams t
       LEFT JOIN sports s ON s.id = t.sport_id
       LEFT JOIN halls  h ON h.id = t.hall_id
       WHERE t.id=$1`,
      [teamId]
    );

    const { rows: coaches } = await query(
      `SELECT u.full_name, u.email
       FROM team_coaches tc JOIN users u ON u.id = tc.coach_id
       WHERE tc.team_id=$1 ORDER BY u.full_name`,
      [teamId]
    );

    const { rows: members } = await query(
      `SELECT a.id, a.full_name, a.gender, a.birth_date, s.name AS sport_name
       FROM athletes a LEFT JOIN sports s ON s.id = a.sport_id
       WHERE a.team_id=$1 AND a.is_active=TRUE ORDER BY a.full_name`,
      [teamId]
    );

    res.json({ success: true, data: { team: teamRows[0], coaches, members } });
  } catch {
    res.status(401).json({ success: false, error: 'Token yaroqsiz' });
  }
};
