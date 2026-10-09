import type { Request, Response } from 'express';
import type { ErrorResponse } from '../types/api';

/** Catch-all for unmatched routes. Registered with a pathless `app.use` after all routers. */
export function notFound(_req: Request, res: Response<ErrorResponse>): void {
  res.status(404).json({ message: 'Route not found' });
}
