import { Router } from 'express';
import { getReview, idRules, listReviews, listReviewsRules } from '../controllers/reviews.controller';
import { validate } from '../middleware/validate';

const router = Router();

// Review history is append-only: reviews are created by `POST /api/cards/:id/reviews`
// and can only be read here. There is deliberately no update or delete route.
router.get('/', validate(listReviewsRules), listReviews);
router.get('/:id', validate(idRules), getReview);

export default router;
