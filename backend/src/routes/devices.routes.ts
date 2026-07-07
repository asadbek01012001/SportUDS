import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { listDevices, registerDevice, deleteDevice, triggerOta, assignDevice } from '../controllers/devices.controller';

// Qurilma boshqaruvi — faqat admin (va super_admin, role middleware ichida).
const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/', listDevices);
router.post('/', registerDevice);
router.delete('/:id', deleteDevice);
router.post('/:id/ota', triggerOta);
router.post('/:id/assign', assignDevice);   // trenajorga biriktirish/uzish

export default router;
