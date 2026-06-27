import { Request, Response } from 'express';
import { query } from '../config/database';
import { emitMeasurement, emitSessionStatus } from '../socket';

// Sportchi QR scan qilganda — athlete + session bog'lanadi
export const scanQr = async (req: Request, res: Response) => {
  const { token, athlete_id } = req.body;
  if (!token || !athlete_id) return res.status(400).json({ success: false, error: 'token va athlete_id kerak' });

  try {
    const { rows } = await query(
      `SELECT * FROM machine_sessions WHERE qr_token=$1 AND status='waiting'`, [token]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Token noto\'g\'ri yoki allaqachon ishlatilgan' });

    const { rows: updated } = await query(
      `UPDATE machine_sessions
       SET athlete_id=$1, status='active', started_at=NOW()
       WHERE qr_token=$2
       RETURNING id, machine_id, status, started_at`,
      [athlete_id, token]
    );

    const session = updated[0];
    emitSessionStatus(session.id, 'active');
    res.json({ success: true, data: session });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Mashina ma'lumot yuboradi (bar_cm + weight_kg)
export const saveMeasurement = async (req: Request, res: Response) => {
  const { session_id, bar_cm, weight_kg } = req.body;
  if (!session_id) return res.status(400).json({ success: false, error: 'session_id kerak' });

  try {
    const { rows } = await query(
      `INSERT INTO measurements (session_id, bar_cm, weight_kg)
       VALUES ($1, $2, $3) RETURNING *`,
      [session_id, bar_cm ?? null, weight_kg ?? null]
    );
    const m = rows[0];
    emitMeasurement(session_id, { bar_cm: m.bar_cm, weight_kg: m.weight_kg, recorded_at: m.recorded_at });
    res.json({ success: true, data: m });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Seanasni tugatish
export const endSession = async (req: Request, res: Response) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ success: false, error: 'session_id kerak' });

  try {
    const { rows } = await query(
      `UPDATE machine_sessions SET status='completed', ended_at=NOW()
       WHERE id=$1 AND status='active'
       RETURNING id, status, ended_at`,
      [session_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Faol seans topilmadi' });
    emitSessionStatus(session_id, 'completed');
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Timeout: 5 daqiqa faol bo'lmagan seanaslarni tugatish (cron o'rniga simple endpoint)
export const checkTimeouts = async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `UPDATE machine_sessions SET status='completed', ended_at=NOW()
       WHERE status='active'
         AND started_at < NOW() - INTERVAL '5 minutes'
         AND id NOT IN (
           SELECT DISTINCT session_id FROM measurements
           WHERE recorded_at > NOW() - INTERVAL '5 minutes'
         )
       RETURNING id`
    );
    rows.forEach(r => emitSessionStatus(r.id, 'completed'));
    res.json({ success: true, ended: rows.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
