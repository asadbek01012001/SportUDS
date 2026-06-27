import { Request, Response } from 'express';
import { query } from '../config/database';

// Jamoa asosiy ma'lumotlari: sport, filial, trenerlar (ko'p) va atlet soni bilan
const TEAM_SELECT = `
  SELECT t.id, t.name, t.description, t.sport_id, t.hall_id, t.created_at,
         s.name AS sport_name,
         h.name AS hall_name,
         COALESCE((SELECT COUNT(*) FROM athletes a WHERE a.team_id = t.id AND a.is_active = TRUE), 0) AS athlete_count,
         COALESCE((
           SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email))
           FROM team_coaches tc JOIN users u ON u.id = tc.coach_id WHERE tc.team_id = t.id
         ), '[]') AS coaches
  FROM teams t
  LEFT JOIN sports s ON s.id = t.sport_id
  LEFT JOIN halls  h ON h.id = t.hall_id
`;

// Ro'yxat. Trener faqat o'zi biriktirilgan jamoalarni ko'radi; admin/super_admin barchasini.
export const getTeams = async (req: Request, res: Response) => {
  try {
    const params: unknown[] = [];
    let where = '';
    if (req.user?.role === 'coach') {
      params.push(req.user.userId);
      where = `WHERE t.id IN (SELECT team_id FROM team_coaches WHERE coach_id = $${params.length})`;
    }
    const { rows } = await query(`${TEAM_SELECT} ${where} ORDER BY t.name`, params);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Bitta jamoa + a'zolari (atletlar)
export const getTeamById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await query(`${TEAM_SELECT} WHERE t.id = $1`, [id]);
    if (!rows.length) {
      res.status(404).json({ success: false, error: 'Jamoa topilmadi' });
      return;
    }
    const { rows: athletes } = await query(
      `SELECT a.id, a.full_name, a.birth_date, a.gender, s.name AS sport_name,
              (SELECT COUNT(*) FROM machine_sessions ms WHERE ms.athlete_id = a.id AND ms.status = 'completed') AS sessions_count
       FROM athletes a
       LEFT JOIN sports s ON s.id = a.sport_id
       WHERE a.team_id = $1 AND a.is_active = TRUE
       ORDER BY a.full_name`,
      [id]
    );
    res.json({ success: true, data: { ...rows[0], athletes } });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const createTeam = async (req: Request, res: Response) => {
  const { name, sport_id, hall_id, description, coach_ids } = req.body;
  if (!name) {
    res.status(400).json({ success: false, error: 'Jamoa nomi kerak' });
    return;
  }
  try {
    const { rows } = await query(
      `INSERT INTO teams (name, sport_id, hall_id, description) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, sport_id || null, hall_id || null, description || null]
    );
    const teamId = rows[0].id;

    const ids: string[] = Array.isArray(coach_ids) ? coach_ids : [];
    // Trener o'zi yaratsa, avtomatik biriktirilsin
    if (req.user?.role === 'coach' && !ids.includes(req.user.userId)) ids.push(req.user.userId);
    for (const cid of ids) {
      await query(`INSERT INTO team_coaches (team_id, coach_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [teamId, cid]);
    }

    res.status(201).json({ success: true, data: { id: teamId } });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, sport_id, hall_id, description, coach_ids } = req.body;
  try {
    const { rows } = await query(
      `UPDATE teams SET name=$1, sport_id=$2, hall_id=$3, description=$4 WHERE id=$5 RETURNING id`,
      [name, sport_id || null, hall_id || null, description || null, id]
    );
    if (!rows.length) {
      res.status(404).json({ success: false, error: 'Jamoa topilmadi' });
      return;
    }
    // coach_ids berilgan bo'lsa — trenerlarni qayta yozamiz
    if (Array.isArray(coach_ids)) {
      await query(`DELETE FROM team_coaches WHERE team_id=$1`, [id]);
      for (const cid of coach_ids) {
        await query(`INSERT INTO team_coaches (team_id, coach_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, cid]);
      }
    }
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  try {
    await query(`DELETE FROM teams WHERE id=$1`, [req.params.id]);
    res.json({ success: true, message: 'Jamoa o\'chirildi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Atletni jamoaga biriktirish
export const addAthlete = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { athlete_id } = req.body;
  if (!athlete_id) {
    res.status(400).json({ success: false, error: 'athlete_id kerak' });
    return;
  }
  try {
    await query(`UPDATE athletes SET team_id=$1 WHERE id=$2`, [id, athlete_id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Atletni jamoadan chiqarish
export const removeAthlete = async (req: Request, res: Response) => {
  try {
    await query(`UPDATE athletes SET team_id=NULL WHERE id=$1`, [req.params.athlete_id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Trener tanlash uchun ro'yxat (jamoaga biriktirish)
export const getCoaches = async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, role FROM users
       WHERE role IN ('coach','researcher','operator') AND is_active = TRUE
       ORDER BY full_name`
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Ochiq ro'yxat — mobil ilovada ro'yxatdan o'tishda jamoa tanlash uchun (auth talab qilinmaydi)
export const getPublicTeams = async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.name, s.name AS sport_name
       FROM teams t LEFT JOIN sports s ON s.id = t.sport_id
       ORDER BY t.name`
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
