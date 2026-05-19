import { Router } from 'express';
import {
  getSessions, getSessionById, createSession,
  saveSensorData, completeSession, validateSession,
} from '../controllers/sessions.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getSessions);
router.get('/:id', getSessionById);
router.post('/', authorize('admin', 'researcher', 'operator', 'coach'), createSession);
router.post('/:id/sensor-data', authorize('admin', 'researcher', 'operator'), saveSensorData);
router.post('/:id/complete', authorize('admin', 'researcher', 'operator'), completeSession);
router.post('/:id/validate', authorize('admin', 'researcher', 'coach'), validateSession);

export default router;
