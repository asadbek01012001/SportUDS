import { Router } from 'express';
import { scanQr, saveMeasurement, endSession, checkTimeouts, getMachineQr, startByMachine } from '../controllers/machine.controller';

const router = Router();
router.get('/:id/qr', getMachineQr);   // web: QR ma'lumoti (PDF uchun)
router.post('/start', startByMachine);  // mobil: trenajor bo'yicha sessiya boshlash
router.post('/scan', scanQr);
router.post('/measurement', saveMeasurement);
router.post('/end', endSession);
router.post('/timeouts', checkTimeouts);
export default router;
