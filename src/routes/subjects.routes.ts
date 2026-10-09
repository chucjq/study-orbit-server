import { Router } from 'express';
import {
  bodyRules,
  createSubject,
  deleteSubject,
  getSubject,
  idAndBodyRules,
  idRules,
  listRules,
  listSubjects,
  updateSubject,
} from '../controllers/subjects.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/', validate(listRules), listSubjects);
router.get('/:id', validate(idRules), getSubject);
router.post('/', validate(bodyRules), createSubject);
router.put('/:id', validate(idAndBodyRules), updateSubject);
router.delete('/:id', validate(idRules), deleteSubject);

export default router;
