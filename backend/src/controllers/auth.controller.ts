import { Request, Response } from 'express';
import { query } from '../config/database';
import { User } from '../types';
import {
  findUserByEmail, verifyPassword, hashPassword, generateToken, logAction,
} from '../services/auth.service';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ success: false, error: 'Email yoki parol noto\'g\'ri' });
      return;
    }

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    await logAction(user.id, 'LOGIN', req.ip);

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<User>(
      'SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = $1',
      [req.user!.userId]
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

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { current_password, new_password } = req.body;
    const result = await query<User>('SELECT * FROM users WHERE id = $1', [req.user!.userId]);
    if (!result.rows.length) {
      res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      return;
    }
    const user = result.rows[0];
    if (!(await verifyPassword(current_password, user.password_hash))) {
      res.status(400).json({ success: false, error: 'Joriy parol noto\'g\'ri' });
      return;
    }
    const hash = await hashPassword(new_password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    res.json({ success: true, message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};
