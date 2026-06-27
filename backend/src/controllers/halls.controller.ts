import { Request, Response } from 'express';
import { query } from '../config/database';

export const getHalls = async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT h.id, h.name, h.address,
        json_agg(json_build_object(
          'id', m.id, 'name', m.name, 'serial_number', m.serial_number
        ) ORDER BY m.name) AS machines
      FROM halls h
      LEFT JOIN machines m ON m.hall_id = h.id AND m.is_active = true
      WHERE h.is_active = true
      GROUP BY h.id
      ORDER BY h.name
    `);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
