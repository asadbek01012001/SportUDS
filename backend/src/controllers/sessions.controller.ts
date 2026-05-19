import { Request, Response } from 'express';
import { query } from '../config/database';
import { calculateUDS, saveIndicators } from '../services/calculation.service';

export const getSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, athlete_id, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (athlete_id) { params.push(athlete_id); where += ` AND ts.athlete_id = $${params.length}`; }
    if (status) { params.push(status); where += ` AND ts.status = $${params.length}`; }

    if (req.user?.role === 'athlete') {
      params.push(req.user.userId);
      where += ` AND a.user_id = $${params.length}`;
    }
    if (req.user?.role === 'coach') {
      params.push(req.user.userId);
      where += ` AND a.coach_id = $${params.length}`;
    }

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM test_sessions ts
       JOIN athletes a ON ts.athlete_id = a.id ${where}`,
      params
    );

    params.push(Number(limit), offset);
    const result = await query(
      `SELECT ts.*, a.full_name as athlete_name, tp.name as protocol_name,
              tp.test_type, u.full_name as operator_name
       FROM test_sessions ts
       JOIN athletes a ON ts.athlete_id = a.id
       JOIN test_protocols tp ON ts.protocol_id = tp.id
       JOIN users u ON ts.operator_id = u.id
       ${where}
       ORDER BY ts.session_date DESC
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

export const getSessionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const [sessionResult, indicatorsResult, rawResult] = await Promise.all([
      query(
        `SELECT ts.*, a.full_name as athlete_name, tp.name as protocol_name,
                tp.test_type, u.full_name as operator_name
         FROM test_sessions ts
         JOIN athletes a ON ts.athlete_id = a.id
         JOIN test_protocols tp ON ts.protocol_id = tp.id
         JOIN users u ON ts.operator_id = u.id
         WHERE ts.id = $1`,
        [id]
      ),
      query('SELECT * FROM calculated_indicators WHERE session_id = $1 ORDER BY attempt_number', [id]),
      query('SELECT * FROM raw_sensor_data WHERE session_id = $1 ORDER BY attempt_number', [id]),
    ]);

    if (!sessionResult.rows.length) {
      res.status(404).json({ success: false, error: 'Sessiya topilmadi' });
      return;
    }

    res.json({
      success: true,
      data: {
        session: sessionResult.rows[0],
        indicators: indicatorsResult.rows,
        raw_data: rawResult.rows,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const createSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      athlete_id, protocol_id, session_date, training_context,
      body_weight, heart_rate, subjective_state, notes,
    } = req.body;

    const result = await query(
      `INSERT INTO test_sessions (athlete_id, protocol_id, operator_id, session_date,
        training_context, body_weight, heart_rate, subjective_state, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [athlete_id, protocol_id, req.user!.userId, session_date || new Date(),
       training_context, body_weight, heart_rate, subjective_state, notes]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const saveSensorData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { attempt_number, time_ms, force_values, displacement_values, sampling_rate } = req.body;

    // Save raw data
    await query(
      `INSERT INTO raw_sensor_data (session_id, attempt_number, time_ms, force_values, displacement_values, sampling_rate)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, attempt_number, `{${time_ms.join(',')}}`, `{${force_values.join(',')}}`,
       `{${(displacement_values || []).join(',')}}`, sampling_rate || 1000]
    );

    // UDS ko'rsatkichlarini hisoblash va saqlash
    const indicators = calculateUDS(force_values, time_ms, displacement_values || []);
    if (indicators) {
      await saveIndicators(id, attempt_number, indicators);
    }

    await query(
      `UPDATE test_sessions SET status = 'in_progress' WHERE id = $1 AND status = 'pending'`,
      [id]
    );

    res.json({ success: true, data: indicators });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const completeSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query(
      `UPDATE test_sessions SET status = 'completed' WHERE id = $1`,
      [id]
    );
    res.json({ success: true, message: 'Sessiya yakunlandi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const validateSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query(
      `UPDATE test_sessions SET status = 'validated', validated_by = $1 WHERE id = $2`,
      [req.user!.userId, id]
    );
    res.json({ success: true, message: 'Sessiya tasdiqlandi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
