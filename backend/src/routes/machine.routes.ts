import { Router } from 'express';
import { scanQr, saveMeasurement, endSession, checkTimeouts, getMachineQr, startByMachine } from '../controllers/machine.controller';
import { getMachineDevice } from '../controllers/devices.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.get('/:id/qr', getMachineQr);   // web: QR ma'lumoti (PDF uchun)
router.get('/:id/device', authenticate, getMachineDevice);   // trenajorga biriktirilgan device + telemetriya
router.post('/start', startByMachine);  // mobil: trenajor bo'yicha sessiya boshlash
router.post('/scan', scanQr);
router.post('/measurement', saveMeasurement);
router.post('/end', endSession);
router.post('/timeouts', checkTimeouts);
export default router;
