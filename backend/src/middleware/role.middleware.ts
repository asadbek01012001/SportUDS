import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Autentifikatsiya talab qilinadi' });
      return;
    }
    // Super Admin hamma narsaga ruxsatga ega (eng yuqori daraja)
    if (req.user.role === 'super_admin') {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Bu amalni bajarish uchun ruxsat yo\'q' });
      return;
    }
    next();
  };
};
