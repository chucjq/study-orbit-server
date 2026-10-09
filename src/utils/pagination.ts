import { z } from 'zod';
import type { ListResponse } from '../types/api';

export const MAX_LIMIT = 100;
/** Default page size for subjects and decks (small collections, shown in full). */
export const DEFAULT_LIMIT_ALL = 100;
/** Default page size for cards, reviews and sessions. */
export const DEFAULT_LIMIT_PAGED = 20;

/**
 * Query schema for `page` and `limit`. A non-integer or out-of-range value is a 400.
 * Returns an object schema so list endpoints can add their own filters with `.extend({...})`.
 */
export function paginationQuerySchema(defaultLimit: number) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(defaultLimit),
  });
}

export interface PageParams {
  page: number;
  limit: number;
}

/** Number of documents to skip for `.skip()`; pages start at 1. */
export function toSkip({ page, limit }: PageParams): number {
  return (page - 1) * limit;
}

export function buildListResponse<T>(data: T[], total: number, { page, limit }: PageParams): ListResponse<T> {
  return { data, total, page, limit };
}
