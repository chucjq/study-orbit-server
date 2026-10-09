import { vi, type Mock } from 'vitest';

/**
 * A stand-in for a Mongoose Query in tests that have no database: every builder method
 * returns the stub itself, and awaiting it yields `result`. The mocks record their arguments.
 */
export interface QueryStub<T> extends PromiseLike<T> {
  collation: Mock<(...args: unknown[]) => QueryStub<T>>;
  sort: Mock<(...args: unknown[]) => QueryStub<T>>;
  skip: Mock<(...args: unknown[]) => QueryStub<T>>;
  limit: Mock<(...args: unknown[]) => QueryStub<T>>;
  select: Mock<(...args: unknown[]) => QueryStub<T>>;
  populate: Mock<(...args: unknown[]) => QueryStub<T>>;
  lean: Mock<(...args: unknown[]) => QueryStub<T>>;
}

export function queryStub<T>(result: T): QueryStub<T> {
  const stub: QueryStub<T> = {
    collation: vi.fn(() => stub),
    sort: vi.fn(() => stub),
    skip: vi.fn(() => stub),
    limit: vi.fn(() => stub),
    select: vi.fn(() => stub),
    populate: vi.fn(() => stub),
    lean: vi.fn(() => stub),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return stub;
}
