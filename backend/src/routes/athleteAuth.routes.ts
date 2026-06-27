import { Router } from 'express';
import {
  registerAthlete, loginAthlete, verifyToken, getAthleteHistory, getMyTeam,
} from '../controllers/athleteAuth.controller';

const router = Router();
router.post('/register', registerAthlete);
router.post('/login', loginAthlete);
router.get('/verify', verifyToken);
router.get('/history', getAthleteHistory);
router.get('/team', getMyTeam);
export default router;
