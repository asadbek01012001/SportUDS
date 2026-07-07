import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import {
  listFirmwares, getFirmware, uploadFirmware, downloadFirmware, patchFirmware, deleteFirmware,
} from '../controllers/firmwares.controller';

// OTA proshivka repozitoriysi — faqat admin (va super_admin). Qurilma OTA yangilanishida ishlatiladi.
const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/', listFirmwares);
router.post('/', uploadFirmware);
router.get('/:id', getFirmware);
router.get('/:id/download', downloadFirmware);
router.patch('/:id', patchFirmware);
router.delete('/:id', deleteFirmware);

export default router;
