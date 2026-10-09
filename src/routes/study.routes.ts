import { Router } from 'express';
import { getQueue, queueRules } from '../controllers/study.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/queue', validate(queueRules), getQueue);

export default router;
