import { Router } from 'express';
import {
  getAthleteDynamics, comparePrePostLoad, getGroupComparison,
  getAiRecommendation, getSports, getTeams, getProtocols, createProtocol,
  createSport, updateSport, deleteSport,
} from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();
router.use(authenticate);

router.get('/sports', getSports);
router.post('/sports', authorize('admin'), createSport);
router.put('/sports/:id', authorize('admin'), updateSport);
router.delete('/sports/:id', authorize('admin'), deleteSport);
router.get('/teams', getTeams);
router.get('/protocols', getProtocols);
router.post('/protocols', authorize('admin', 'researcher'), createProtocol);

router.get('/dynamics/:athlete_id', getAthleteDynamics);
router.get('/pre-post/:athlete_id', comparePrePostLoad);
router.get('/group-comparison', getGroupComparison);
router.get('/recommendation/:athlete_id', authorize('admin', 'researcher', 'coach'), getAiRecommendation);

export default router;
