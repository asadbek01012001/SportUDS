import { Router } from 'express';
import { startMachineSession, getSessionStatus } from '../controllers/supervisor.controller';

const router = Router();
router.post('/start', startMachineSession);
router.get('/session/:token', getSessionStatus);
export default router;
