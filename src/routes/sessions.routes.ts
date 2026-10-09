import { Router } from 'express';
import {
  createRules,
  createSession,
  finishRules,
  finishSession,
  getSession,
  idRules,
  listRules,
  listSessions,
} from '../controllers/sessions.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.post('/', validate(createRules), createSession);
router.get('/', validate(listRules), listSessions);
router.get('/:id', validate(idRules), getSession);
router.patch('/:id', validate(finishRules), finishSession);

export default router;
