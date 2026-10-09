import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ErrorResponse } from '../types/api';
import { AppError } from '../utils/appError';
import { INVALID_ID_MESSAGE } from '../utils/objectId';

const DUPLICATE_KEY_CODE = 11000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Names the first invalid field of a Zod error, e.g. `title: Invalid input`. */
function describeZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request';
  if (issue.message === INVALID_ID_MESSAGE) return INVALID_ID_MESSAGE;
  if (issue.code === 'unrecognized_keys') return `Unknown field: ${issue.keys.join(', ')}`;
  const field = issue.path.map(String).join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

function describeValidationError(error: mongoose.Error.ValidationError): string {
  const details = Object.entries(error.errors).map(([path, fieldError]) => `${path}: ${fieldError.message}`);
  return details.length > 0 ? details.join('; ') : 'Validation failed';
}

function describeDuplicateKey(error: mongoose.mongo.MongoServerError): string {
  const keyValue: unknown = error.keyValue;
  const fields = isRecord(keyValue) ? Object.keys(keyValue).join(', ') : '';
  return fields ? `Duplicate value for: ${fields}` : 'Duplicate value';
}

function isBodyParseError(error: unknown): boolean {
  return isRecord(error) && error.type === 'entity.parse.failed';
}

/** Maps any thrown value to a status code and an `ErrorResponse`. Never uses `any`. */
function toErrorResponse(error: unknown): { status: number; body: ErrorResponse } {
  if (error instanceof AppError) {
    return { status: error.statusCode, body: { message: error.message } };
  }
  if (error instanceof ZodError) {
    return { status: 400, body: { message: describeZodError(error) } };
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return { status: 400, body: { message: describeValidationError(error) } };
  }
  if (error instanceof mongoose.Error.CastError) {
    return { status: 400, body: { message: 'Invalid ID' } };
  }
  if (error instanceof mongoose.mongo.MongoServerError && error.code === DUPLICATE_KEY_CODE) {
    return { status: 400, body: { message: describeDuplicateKey(error) } };
  }
  if (isBodyParseError(error)) {
    return { status: 400, body: { message: 'Invalid JSON body' } };
  }
  return { status: 500, body: { message: 'Internal server error' } };
}

/** Last middleware. The four-argument signature is what makes Express treat it as an error handler. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  const { status, body } = toErrorResponse(error);
  if (status === 500) console.error('Unexpected error:', error);
  res.status(status).json(body);
}
