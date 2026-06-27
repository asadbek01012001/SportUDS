import { Router } from 'express';
import {
  getUsers, createUser, updateUser, deleteUser, resetUserPassword,
  getDashboardStats, getAuditLog,
} from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/stats', getDashboardStats);
// Audit jurnali — faqat Super Admin
router.get('/audit-log', authorize('super_admin'), getAuditLog);

router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
// Foydalanuvchini o'chirish — faqat Super Admin
router.delete('/users/:id', authorize('super_admin'), deleteUser);
router.post('/users/:id/reset-password', resetUserPassword);

export default router;
