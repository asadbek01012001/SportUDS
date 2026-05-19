import { Request, Response } from 'express';
import { query } from '../config/database';
import { User } from '../types';
import { hashPassword } from '../services/auth.service';

// --- Users CRUD ---
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, search = '', role } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (full_name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      whereClause += ` AND role = $${params.length}`;
    }

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(Number(limit), offset);
    const result = await query<User>(
      `SELECT id, email, full_name, role, is_active, created_at FROM users ${whereClause}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, role } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(400).json({ success: false, error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
      return;
    }

    const hash = await hashPassword(password);
    const result = await query<User>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, hash, full_name, role]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_values) VALUES ($1, 'CREATE_USER', 'users', $2, $3)`,
      [req.user!.userId, result.rows[0].id, JSON.stringify({ email, full_name, role })]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { full_name, role, is_active } = req.body;

    const result = await query<User>(
      `UPDATE users SET full_name = $1, role = $2, is_active = $3
       WHERE id = $4
       RETURNING id, email, full_name, role, is_active, created_at`,
      [full_name, role, is_active, id]
    );

    if (!result.rows.length) {
      res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (id === req.user!.userId) {
      res.status(400).json({ success: false, error: 'O\'zingizni o\'chira olmaysiz' });
      return;
    }

    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
    res.json({ success: true, message: 'Foydalanuvchi deaktivatsiya qilindi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    const hash = await hashPassword(new_password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    res.json({ success: true, message: 'Parol tiklandi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// --- Stats ---
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [users, athletes, sessions, sports] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'),
      query<{ count: string }>('SELECT COUNT(*) as count FROM athletes WHERE is_active = TRUE'),
      query<{ count: string }>('SELECT COUNT(*) as count FROM test_sessions'),
      query<{ count: string }>('SELECT COUNT(*) as count FROM sports'),
    ]);

    const recentActivity = await query(
      `SELECT al.action, al.entity_type, al.created_at, u.full_name
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 10`
    );

    const monthlySessionsResult = await query<{ month: string; count: string }>(
      `SELECT TO_CHAR(session_date, 'YYYY-MM') as month, COUNT(*) as count
       FROM test_sessions
       WHERE session_date >= NOW() - INTERVAL '12 months'
       GROUP BY month
       ORDER BY month`
    );

    res.json({
      success: true,
      data: {
        stats: {
          users: parseInt(users.rows[0].count),
          athletes: parseInt(athletes.rows[0].count),
          sessions: parseInt(sessions.rows[0].count),
          sports: parseInt(sports.rows[0].count),
        },
        recent_activity: recentActivity.rows,
        monthly_sessions: monthlySessionsResult.rows,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// --- Audit Log ---
export const getAuditLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT al.*, u.full_name, u.email
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await query<{ count: string }>('SELECT COUNT(*) as count FROM audit_log');

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
