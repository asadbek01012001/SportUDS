import { Router } from 'express';
import {
  getAthletes, getAthleteById, createAthlete, updateAthlete,
  deleteAthlete, getAthleteSessions,
} from '../controllers/athletes.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getAthletes);
router.get('/:id', getAthleteById);
router.get('/:id/sessions', getAthleteSessions);
router.post('/', authorize('admin', 'researcher', 'coach'), createAthlete);
router.put('/:id', authorize('admin', 'researcher', 'coach'), updateAthlete);
router.delete('/:id', authorize('admin', 'researcher'), deleteAthlete);

export default router;
