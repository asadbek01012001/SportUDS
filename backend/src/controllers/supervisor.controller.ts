import { Request, Response } from 'express';
import { query } from '../config/database';

// Supervisor mashinani tanlaydi → machine_session yaratiladi → QR token qaytariladi
export const startMachineSession = async (req: Request, res: Response) => {
  const { machine_id } = req.body;
  if (!machine_id) return res.status(400).json({ success: false, error: 'machine_id kerak' });

  try {
    // Mashina mavjudligini tekshirish (eski/yaroqsiz ID uchun 500 emas, 404)
    const exists = await query('SELECT id FROM machines WHERE id=$1 AND is_active=true', [machine_id]);
    if (!exists.rows.length) {
      return res.status(404).json({ success: false, error: 'Mashina topilmadi' });
    }

    // Avvalgi waiting/active seanlarni complete qilish (agar bo'lsa)
    await query(
      `UPDATE machine_sessions SET status='completed', ended_at=NOW()
       WHERE machine_id=$1 AND status IN ('waiting','active')`,
      [machine_id]
    );

    const { rows } = await query(
      `INSERT INTO machine_sessions (machine_id) VALUES ($1)
       RETURNING id, qr_token, status, created_at`,
      [machine_id]
    );

    const session = rows[0];
    const baseUrl = process.env.APP_BASE_URL || `http://${getLocalIp()}:${process.env.PORT || 5000}`;
    const qrUrl = `${baseUrl}/scan?token=${session.qr_token}`;

    res.json({ success: true, data: { ...session, qr_url: qrUrl } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// Seansning hozirgi holatini olish (supervisor polling)
export const getSessionStatus = async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const { rows } = await query(`
      SELECT ms.id, ms.status, ms.started_at, ms.ended_at,
             a.full_name AS athlete_name,
             m.name AS machine_name,
             h.name AS hall_name,
             (SELECT json_build_object('bar_cm', bar_cm, 'weight_kg', weight_kg, 'recorded_at', recorded_at)
              FROM measurements WHERE session_id = ms.id
              ORDER BY recorded_at DESC LIMIT 1) AS last_measurement
      FROM machine_sessions ms
      JOIN machines m ON m.id = ms.machine_id
      JOIN halls h ON h.id = m.hall_id
      LEFT JOIN athletes a ON a.id = ms.athlete_id
      WHERE ms.qr_token = $1
    `, [token]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'Seans topilmadi' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

function getLocalIp() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
