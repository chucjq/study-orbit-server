import { Router } from 'express';
import {
  bodyRules,
  createCard,
  deleteCard,
  getCard,
  idAndBodyRules,
  idRules,
  listAllCards,
  listRules,
  setSuspension,
  suspensionRules,
  updateCard,
} from '../controllers/cards.controller';
import { createReview, createReviewRules } from '../controllers/reviews.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/', validate(listRules), listAllCards);
router.get('/:id', validate(idRules), getCard);
router.post('/', validate(bodyRules), createCard);
router.put('/:id', validate(idAndBodyRules), updateCard);
router.delete('/:id', validate(idRules), deleteCard);
router.post('/:id/reviews', validate(createReviewRules), createReview);
router.patch('/:id/suspension', validate(suspensionRules), setSuspension);

export default router;
