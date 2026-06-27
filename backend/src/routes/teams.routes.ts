import { Router } from 'express';
import {
  getTeams, getTeamById, createTeam, updateTeam, deleteTeam,
  addAthlete, removeAthlete, getCoaches, getPublicTeams,
} from '../controllers/teams.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Ochiq — mobil ro'yxatdan o'tish uchun (authenticate dan oldin)
router.get('/public', getPublicTeams);

router.use(authenticate);

router.get('/coaches', authorize('admin', 'researcher', 'coach', 'operator'), getCoaches);
router.get('/', getTeams);
router.get('/:id', getTeamById);
router.post('/', authorize('admin', 'researcher', 'coach'), createTeam);
router.put('/:id', authorize('admin', 'researcher', 'coach'), updateTeam);
router.delete('/:id', authorize('admin'), deleteTeam);
router.post('/:id/athletes', authorize('admin', 'researcher', 'coach'), addAthlete);
router.delete('/:id/athletes/:athlete_id', authorize('admin', 'researcher', 'coach'), removeAthlete);

export default router;
