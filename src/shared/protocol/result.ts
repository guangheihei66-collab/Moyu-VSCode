export interface ResultSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ResultFailure<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = ResultSuccess<T> | ResultFailure<E>;

export function success<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function failure<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isSuccess<T, E>(
  result: Result<T, E>,
): result is ResultSuccess<T> {
  return result.ok;
}

export function isFailure<T, E>(
  result: Result<T, E>,
): result is ResultFailure<E> {
  return !result.ok;
}

export const isOk = isSuccess;
export const isErr = isFailure;

export function mapResult<T, U, E>(
  result: Result<T, E>,
  transform: (value: T) => U,
): Result<U, E> {
  return result.ok ? success(transform(result.value)) : result;
}

export function mapError<T, E, F>(
  result: Result<T, E>,
  transform: (error: E) => F,
): Result<T, F> {
  return result.ok ? result : failure(transform(result.error));
}
