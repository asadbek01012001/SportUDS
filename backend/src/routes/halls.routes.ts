import { Router } from 'express';
import { getHalls } from '../controllers/halls.controller';

const router = Router();
router.get('/', getHalls);
export default router;
