import { Request, Response } from 'express';
import { query } from '../config/database';
import { generateRecommendation } from '../services/ai.service';

type Lang = 'uz' | 'ru' | 'en';

function getLang(req: Request): Lang {
  const h = req.headers['accept-language'];
  const raw = typeof h === 'string' ? h.split(',')[0].trim().toLowerCase() : '';
  return (['uz', 'ru', 'en'] as Lang[]).includes(raw as Lang) ? (raw as Lang) : 'uz';
}

export const getAthleteDynamics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { athlete_id } = req.params;
    const { from, to, test_type } = req.query;

    const params: unknown[] = [athlete_id];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND ts.session_date >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND ts.session_date <= $${params.length}`; }
    if (test_type) { params.push(test_type); dateFilter += ` AND tp.test_type = $${params.length}`; }

    const result = await query(
      `SELECT ts.session_date, ts.training_context, tp.name as protocol_name, tp.test_type,
              ci.f_max, ci.t_max, ci.j_speed_strength_index, ci.q_start_force,
              ci.g_accelerating_force, ci.v_max, ci.n_max, ci.p0_max_isometric
       FROM test_sessions ts
       JOIN calculated_indicators ci ON ci.session_id = ts.id AND ci.is_best_attempt = TRUE
       JOIN test_protocols tp ON ts.protocol_id = tp.id
       WHERE ts.athlete_id = $1 AND ts.status IN ('completed','validated') ${dateFilter}
       ORDER BY ts.session_date`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const comparePrePostLoad = async (req: Request, res: Response): Promise<void> => {
  try {
    const { athlete_id } = req.params;
    const { date } = req.query;

    const params: unknown[] = [athlete_id];
    let dateFilter = '';
    if (date) {
      params.push(date);
      dateFilter = ` AND DATE(ts.session_date) = $${params.length}`;
    }

    const result = await query(
      `SELECT ts.training_context, ts.session_date,
              ci.f_max, ci.j_speed_strength_index, ci.n_max, ci.q_start_force
       FROM test_sessions ts
       JOIN calculated_indicators ci ON ci.session_id = ts.id AND ci.is_best_attempt = TRUE
       WHERE ts.athlete_id = $1
         AND ts.training_context IN ('pre_load','post_load')
         ${dateFilter}
       ORDER BY ts.session_date`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const getGroupComparison = async (req: Request, res: Response): Promise<void> => {
  try {
    const { team_id, sport_id } = req.query;
    const params: unknown[] = [];
    let whereClause = '';

    if (team_id) { params.push(team_id); whereClause += ` AND a.team_id = $${params.length}`; }
    if (sport_id) { params.push(sport_id); whereClause += ` AND a.sport_id = $${params.length}`; }

    const result = await query(
      `SELECT a.id, a.full_name, a.gender, a.qualification,
              AVG(ci.f_max) as avg_f_max,
              AVG(ci.j_speed_strength_index) as avg_j,
              AVG(ci.n_max) as avg_n_max,
              AVG(ci.q_start_force) as avg_q,
              COUNT(ts.id) as sessions_count
       FROM athletes a
       JOIN test_sessions ts ON ts.athlete_id = a.id AND ts.status IN ('completed','validated')
       JOIN calculated_indicators ci ON ci.session_id = ts.id AND ci.is_best_attempt = TRUE
       WHERE a.is_active = TRUE ${whereClause}
       GROUP BY a.id, a.full_name, a.gender, a.qualification
       ORDER BY avg_f_max DESC NULLS LAST`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const getAiRecommendation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { athlete_id } = req.params;
    const result = await generateRecommendation(athlete_id);
    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const getSports = async (req: Request, res: Response): Promise<void> => {
  try {
    const lang = getLang(req);
    const result = await query(
      `SELECT *,
              name_${lang} AS name_localized,
              description_${lang} AS description_localized
       FROM sports
       ORDER BY COALESCE(name_${lang}, name_uz, name_ru, name_en, name) NULLS LAST`
    );
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Server xatosi' });
  }
};

export const getTeams = async (req: Request, res: Response): Promise<void> => {
  try {
    const lang = getLang(req);
    const { sport_id } = req.query;
    const params: unknown[] = [];
    let where = '';
    if (sport_id) { params.push(sport_id); where = `WHERE t.sport_id = $1`; }

    const result = await query(
      `SELECT t.*,
              COALESCE(s.name_${lang}, s.name_uz, s.name_ru, s.name_en, s.name) AS sport_name,
              u.full_name AS coach_name
       FROM teams t
       LEFT JOIN sports s ON t.sport_id = s.id
       LEFT JOIN users u ON t.coach_id = u.id
       ${where} ORDER BY t.name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Server xatosi' });
  }
};

export const getProtocols = async (req: Request, res: Response): Promise<void> => {
  try {
    const lang = getLang(req);
    const result = await query(
      `SELECT tp.*,
              tp.name_${lang} AS name_localized,
              tp.description_${lang} AS description_localized,
              u.full_name AS created_by_name
       FROM test_protocols tp
       LEFT JOIN users u ON tp.created_by = u.id
       ORDER BY COALESCE(tp.name_${lang}, tp.name_uz, tp.name_ru, tp.name_en, tp.name) NULLS LAST`
    );
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Server xatosi' });
  }
};

export const createProtocol = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name_uz, name_ru, name_en,
      test_type, description_uz, description_ru, description_en,
      initial_position, joint_angle, execution_mode, attempts_count,
    } = req.body;

    const name = name_uz;
    if (!name) {
      res.status(400).json({ success: false, error: 'Uzbekcha nom kiritilishi shart' });
      return;
    }

    const result = await query(
      `INSERT INTO test_protocols
         (name, name_uz, name_ru, name_en,
          test_type, description, description_uz, description_ru, description_en,
          initial_position, joint_angle, execution_mode, attempts_count, created_by)
       VALUES ($1,$1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        name, name_ru || null, name_en || null,
        test_type,
        description_uz || null, description_ru || null, description_en || null,
        initial_position || null, joint_angle || null,
        execution_mode || null, attempts_count || 3, req.user!.userId,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const createSport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name_uz, name_ru, name_en, description_uz, description_ru, description_en } = req.body;
    if (!name_uz) {
      res.status(400).json({ success: false, error: 'Uzbekcha nom kiritilishi shart' });
      return;
    }
    const exists = await query('SELECT id FROM sports WHERE name_uz = $1', [name_uz]);
    if (exists.rowCount && exists.rowCount > 0) {
      res.status(400).json({ success: false, error: 'Bu nom allaqachon mavjud' });
      return;
    }
    const result = await query(
      `INSERT INTO sports
         (name, name_uz, name_ru, name_en, description, description_uz, description_ru, description_en)
       VALUES ($1,$1,$2,$3,$4,$4,$5,$6) RETURNING *`,
      [name_uz, name_ru || null, name_en || null, description_uz || null, description_ru || null, description_en || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const updateSport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name_uz, name_ru, name_en, description_uz, description_ru, description_en } = req.body;
    if (!name_uz) {
      res.status(400).json({ success: false, error: 'Uzbekcha nom kiritilishi shart' });
      return;
    }
    const result = await query(
      `UPDATE sports
       SET name = $1, name_uz = $1, name_ru = $2, name_en = $3,
           description = $4, description_uz = $4, description_ru = $5, description_en = $6
       WHERE id = $7 RETURNING *`,
      [name_uz, name_ru || null, name_en || null, description_uz || null, description_ru || null, description_en || null, id]
    );
    if (!result.rows.length) {
      res.status(404).json({ success: false, error: 'Sport turi topilmadi' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const deleteSport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const used = await query('SELECT id FROM athletes WHERE sport_id = $1 LIMIT 1', [id]);
    if (used.rowCount && used.rowCount > 0) {
      res.status(400).json({ success: false, error: 'Bu sport turi sportchilarga biriktirilgan' });
      return;
    }
    await query('DELETE FROM sports WHERE id = $1', [id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
