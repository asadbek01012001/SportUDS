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
router.get('/audit-log', getAuditLog);

router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.post('/users/:id/reset-password', resetUserPassword);

export default router;
