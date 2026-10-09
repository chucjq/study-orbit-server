import { z } from 'zod';

export const INVALID_ID_MESSAGE = 'Invalid ID';

/**
 * A 24-character hex ObjectId string. Used for route params and for id filters in
 * query strings (`?deck=`, `?subject=`, `?card=`, `?session=`). The error handler
 * reports a failure as `{ "message": "Invalid ID" }` without a field prefix.
 */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, { error: INVALID_ID_MESSAGE });

/** Params schema for routes with a single `:id`. */
export const idParamsSchema = z.object({ id: objectIdSchema });
