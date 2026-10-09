import { Router } from 'express';
import {
  activityRules,
  deckRules,
  forecastRules,
  getActivity,
  getDeckStats,
  getForecast,
  getHardest,
  getOverview,
  getSubjectStats,
  hardestRules,
} from '../controllers/stats.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/overview', getOverview);
router.get('/decks/:id', validate(deckRules), getDeckStats);
router.get('/subjects', getSubjectStats);
router.get('/activity', validate(activityRules), getActivity);
router.get('/hardest', validate(hardestRules), getHardest);
router.get('/forecast', validate(forecastRules), getForecast);

export default router;
