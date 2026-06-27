import { Router } from 'express';
import { scanQr, saveMeasurement, endSession, checkTimeouts } from '../controllers/machine.controller';

const router = Router();
router.post('/scan', scanQr);
router.post('/measurement', saveMeasurement);
router.post('/end', endSession);
router.post('/timeouts', checkTimeouts);
export default router;
