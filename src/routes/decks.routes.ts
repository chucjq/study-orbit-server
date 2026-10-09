import { Router } from 'express';
import {
  bodyRules,
  createDeck,
  deleteDeck,
  getDeck,
  idAndBodyRules,
  idRules,
  listDecks,
  listRules,
  updateDeck,
} from '../controllers/decks.controller';
import { deckCardsRules, listDeckCards } from '../controllers/cards.controller';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/', validate(listRules), listDecks);
router.get('/:id', validate(idRules), getDeck);
router.get('/:id/cards', validate(deckCardsRules), listDeckCards);
router.post('/', validate(bodyRules), createDeck);
router.put('/:id', validate(idAndBodyRules), updateDeck);
router.delete('/:id', validate(idRules), deleteDeck);

export default router;
