import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestLogger } from './middleware/requestLogger';
import cardsRouter from './routes/cards.routes';
import decksRouter from './routes/decks.routes';
import reviewsRouter from './routes/reviews.routes';
import sessionsRouter from './routes/sessions.routes';
import statsRouter from './routes/stats.routes';
import studyRouter from './routes/study.routes';
import subjectsRouter from './routes/subjects.routes';

// app.ts contains configuration and route mounting only.
const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(cors({ origin: env.CLIENT_ORIGIN }));

app.use('/api/subjects', subjectsRouter);
app.use('/api/decks', decksRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/study', studyRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/stats', statsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
