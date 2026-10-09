import { describe, expect, it } from 'vitest';
import { buildListResponse, DEFAULT_LIMIT_ALL, DEFAULT_LIMIT_PAGED, MAX_LIMIT, paginationQuerySchema, toSkip } from './pagination';

describe('paginationQuerySchema', () => {
  it('defaults to page 1 and the given default limit', () => {
    expect(paginationQuerySchema(DEFAULT_LIMIT_PAGED).parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema(DEFAULT_LIMIT_ALL).parse({})).toEqual({ page: 1, limit: 100 });
  });

  it('coerces numeric strings from the query string', () => {
    expect(paginationQuerySchema(20).parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('accepts the maximum limit', () => {
    expect(paginationQuerySchema(20).parse({ limit: String(MAX_LIMIT) }).limit).toBe(100);
  });

  it.each([
    ['page 0', { page: '0' }],
    ['negative page', { page: '-1' }],
    ['non-integer page', { page: '1.5' }],
    ['non-numeric page', { page: 'abc' }],
    ['empty page', { page: '' }],
    ['limit 0', { limit: '0' }],
    ['limit above the maximum', { limit: '101' }],
    ['non-integer limit', { limit: '2.5' }],
    ['non-numeric limit', { limit: 'ten' }],
  ])('rejects %s', (_name, query) => {
    expect(paginationQuerySchema(20).safeParse(query).success).toBe(false);
  });

  it('names the failing field in the error', () => {
    const result = paginationQuerySchema(20).safeParse({ limit: '500' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['limit']);
  });

  it('can be extended with endpoint filters', () => {
    const schema = paginationQuerySchema(20).extend({ status: paginationQuerySchema(20).shape.page.optional() });
    expect(schema.parse({ page: '2' }).page).toBe(2);
  });
});

describe('toSkip and buildListResponse', () => {
  it('skips (page - 1) * limit documents', () => {
    expect(toSkip({ page: 1, limit: 20 })).toBe(0);
    expect(toSkip({ page: 3, limit: 20 })).toBe(40);
  });

  it('builds the uniform envelope', () => {
    expect(buildListResponse(['a', 'b'], 7, { page: 2, limit: 2 })).toEqual({
      data: ['a', 'b'],
      total: 7,
      page: 2,
      limit: 2,
    });
  });

  it('allows an empty page past the end', () => {
    expect(buildListResponse([], 7, { page: 9, limit: 20 })).toEqual({ data: [], total: 7, page: 9, limit: 20 });
  });
});
