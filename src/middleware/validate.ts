import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';

/** Zod schemas for the three places a request carries data. Body schemas must be `z.strictObject`. */
export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/** The parsed values for the schemas that were given: `z.output` of each schema. */
export type Validated<S extends ValidationSchemas> = {
  [K in keyof S]-?: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

const SOURCES = ['body', 'query', 'params'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Parses `req.body`, `req.query` and `req.params` with the given schemas and stores the
 * results in `res.locals.validated`. A failure throws a `ZodError`, which Express 5 forwards
 * to the error handler (400). Parsed values are never written back onto `req`: `req.query`
 * is read-only in Express 5.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    const validated: Record<string, unknown> = {};
    for (const source of SOURCES) {
      const schema = schemas[source];
      if (schema) validated[source] = schema.parse(req[source]);
    }
    res.locals.validated = validated;
    next();
  };
}

/**
 * The only way handlers read request data. Pass the same schemas object that was given to
 * `validate` so the result is typed from the schemas (`z.output`), not from `req`.
 */
export function getValidated<S extends ValidationSchemas>(res: Response, _schemas: S): Validated<S> {
  const stored: unknown = res.locals.validated;
  if (!isRecord(stored)) {
    throw new Error('getValidated called on a route without the validate middleware');
  }
  return stored as Validated<S>;
}
