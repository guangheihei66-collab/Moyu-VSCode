/**
 * Stable, user-facing error categories.  The concrete error message is an
 * implementation detail and must not be used as a protocol or UI contract.
 */
export const STABLE_ERROR_CODES = [
  'BOOK_NOT_FOUND',
  'BOOK_PERMISSION_DENIED',
  'BOOK_CHANGED',
  'ENCODING_AMBIGUOUS',
  'ENCODING_INVALID',
  'TXT_INDEX_INVALID',
  'EPUB_INVALID_CONTAINER',
  'EPUB_LIMIT_EXCEEDED',
  'EPUB_UNSUPPORTED_DRM',
  'STATE_CONFLICT',
  'STATE_LOCK_TIMEOUT',
  'STATE_CORRUPT',
  'PROTOCOL_INVALID',
] as const;

export type StableErrorCode = (typeof STABLE_ERROR_CODES)[number];
export type ErrorCode = StableErrorCode | 'UNKNOWN_ERROR';

export const RECOVERY_ACTIONS = [
  'relocate',
  'removeFromBookshelf',
  'selectEncoding',
  'rebuildIndex',
  'retry',
] as const;

export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

/**
 * A typed error boundary for domain and adapter code.
 *
 * Callers may retain a detailed message for diagnostics, but presentation
 * code deliberately maps only `code` to a fixed safe message.
 */
export class MoyuError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    message = 'The operation could not be completed.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MoyuError';
  }
}
