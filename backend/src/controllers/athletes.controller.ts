import { Request, Response } from 'express';
import { query } from '../config/database';

export const getAthletes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, search = '', sport_id, team_id, coach_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params: unknown[] = [];
    let where = 'WHERE a.is_active = TRUE';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND a.full_name ILIKE $${params.length}`;
    }
    if (sport_id) { params.push(sport_id); where += ` AND a.sport_id = $${params.length}`; }
    if (team_id) { params.push(team_id); where += ` AND a.team_id = $${params.length}`; }
    if (coach_id) { params.push(coach_id); where += ` AND a.coach_id = $${params.length}`; }

    // Coach sees only their athletes
    if (req.user?.role === 'coach') {
      params.push(req.user.userId);
      where += ` AND a.coach_id = $${params.length}`;
    }
    // Athlete sees only themselves
    if (req.user?.role === 'athlete') {
      params.push(req.user.userId);
      where += ` AND a.user_id = $${params.length}`;
    }

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM athletes a ${where}`,
      params
    );

    params.push(Number(limit), offset);
    const result = await query(
      `SELECT a.*, s.name as sport_name, t.name as team_name,
              u.full_name as coach_name,
              (SELECT COUNT(*) FROM test_sessions ts WHERE ts.athlete_id = a.id) as sessions_count
       FROM athletes a
       LEFT JOIN sports s ON a.sport_id = s.id
       LEFT JOIN teams t ON a.team_id = t.id
       LEFT JOIN users u ON a.coach_id = u.id
       ${where}
       ORDER BY a.full_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const getAthleteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT a.*, s.name as sport_name, t.name as team_name, u.full_name as coach_name
       FROM athletes a
       LEFT JOIN sports s ON a.sport_id = s.id
       LEFT JOIN teams t ON a.team_id = t.id
       LEFT JOIN users u ON a.coach_id = u.id
       WHERE a.id = $1`,
      [id]
    );
    if (!result.rows.length) {
      res.status(404).json({ success: false, error: 'Sportchi topilmadi' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const createAthlete = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      full_name, birth_date, gender, sport_id, team_id, coach_id,
      qualification, weight_category, experience_years, training_stage, user_id,
    } = req.body;

    const result = await query(
      `INSERT INTO athletes (full_name, birth_date, gender, sport_id, team_id, coach_id,
        qualification, weight_category, experience_years, training_stage, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [full_name, birth_date, gender, sport_id, team_id || null, coach_id || null,
       qualification, weight_category, experience_years, training_stage, user_id || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const updateAthlete = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      full_name, birth_date, gender, sport_id, team_id, coach_id,
      qualification, weight_category, experience_years, training_stage,
    } = req.body;

    const result = await query(
      `UPDATE athletes SET full_name=$1, birth_date=$2, gender=$3, sport_id=$4,
        team_id=$5, coach_id=$6, qualification=$7, weight_category=$8,
        experience_years=$9, training_stage=$10
       WHERE id=$11 RETURNING *`,
      [full_name, birth_date, gender, sport_id, team_id || null, coach_id || null,
       qualification, weight_category, experience_years, training_stage, id]
    );

    if (!result.rows.length) {
      res.status(404).json({ success: false, error: 'Sportchi topilmadi' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const deleteAthlete = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query('UPDATE athletes SET is_active = FALSE WHERE id = $1', [id]);
    res.json({ success: true, message: 'Sportchi o\'chirildi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const getAthleteSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT ts.*, tp.name as protocol_name, tp.test_type,
              u.full_name as operator_name,
              ci.f_max, ci.j_speed_strength_index, ci.n_max
       FROM test_sessions ts
       JOIN test_protocols tp ON ts.protocol_id = tp.id
       JOIN users u ON ts.operator_id = u.id
       LEFT JOIN calculated_indicators ci ON ci.session_id = ts.id AND ci.is_best_attempt = TRUE
       WHERE ts.athlete_id = $1
       ORDER BY ts.session_date DESC`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
