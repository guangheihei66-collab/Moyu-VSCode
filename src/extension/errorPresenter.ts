import {
  STABLE_ERROR_CODES,
  type ErrorCode,
  type RecoveryAction,
  type StableErrorCode,
} from '../domain/shared/errors';

export interface PresentedError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly actions: readonly RecoveryAction[];
}

const SAFE_MESSAGES: Record<ErrorCode, string> = {
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
  BOOK_NOT_FOUND: 'This book is no longer available.',
  BOOK_PERMISSION_DENIED: 'Moyu could not read this book.',
  BOOK_CHANGED: 'This book changed on disk. Please refresh it.',
  ENCODING_AMBIGUOUS: 'Moyu needs you to choose the book encoding.',
  ENCODING_INVALID: 'The selected book encoding is invalid.',
  TXT_INDEX_INVALID: 'The text index is invalid and must be rebuilt.',
  EPUB_INVALID_CONTAINER: 'The EPUB container is invalid or incomplete.',
  EPUB_LIMIT_EXCEEDED: 'The EPUB exceeds Moyu’s safety limits.',
  EPUB_UNSUPPORTED_DRM: 'This EPUB uses unsupported DRM.',
  STATE_CONFLICT: 'The data changed in another VS Code window.',
  STATE_LOCK_TIMEOUT: 'Moyu is busy in another VS Code window.',
  STATE_CORRUPT: 'Moyu found invalid saved data and could not use it.',
  GAME_SESSION_STALE: 'The 2048 game session is stale.',
  PROTOCOL_INVALID: 'Moyu received an invalid message.',
};

const ACTIONS: Record<ErrorCode, readonly RecoveryAction[]> = {
  UNKNOWN_ERROR: ['retry'],
  BOOK_NOT_FOUND: ['relocate', 'removeFromBookshelf'],
  BOOK_PERMISSION_DENIED: ['relocate', 'retry'],
  BOOK_CHANGED: ['retry', 'relocate'],
  ENCODING_AMBIGUOUS: ['selectEncoding'],
  ENCODING_INVALID: ['selectEncoding'],
  TXT_INDEX_INVALID: ['rebuildIndex'],
  EPUB_INVALID_CONTAINER: ['retry', 'removeFromBookshelf'],
  EPUB_LIMIT_EXCEEDED: ['removeFromBookshelf'],
  EPUB_UNSUPPORTED_DRM: ['removeFromBookshelf'],
  STATE_CONFLICT: ['retry'],
  STATE_LOCK_TIMEOUT: ['retry'],
  STATE_CORRUPT: ['retry'],
  GAME_SESSION_STALE: ['reloadGame'],
  PROTOCOL_INVALID: ['retry'],
};

const ERROR_CODE_SET = new Set<string>(STABLE_ERROR_CODES);

/** Codes emitted by existing lower-level services before the stable boundary. */
const CODE_ALIASES: Readonly<Record<string, StableErrorCode>> = {
  STATE_VERSION_CONFLICT: 'STATE_CONFLICT',
  STATE_GENERATION_CONFLICT: 'STATE_CONFLICT',
  STATE_INVALID_NEXT_STATE: 'STATE_CORRUPT',
  STATE_GENERATION_NOT_ADVANCED: 'STATE_CORRUPT',
  STATE_COMMIT_VALIDATION_FAILED: 'STATE_CORRUPT',
  STATE_LOCK_OWNERSHIP_LOST: 'STATE_LOCK_TIMEOUT',
  STATE_PATH_OUTSIDE_STORAGE: 'STATE_CORRUPT',
  STATE_INVALID_GENERATION: 'STATE_CORRUPT',
  STATE_RECOVERY_ISOLATION_FAILED: 'STATE_CORRUPT',
  STATE_RECOVERY_RESIDUE_LIMIT: 'STATE_CORRUPT',
  STATE_RECOVERY_ENTRY_BUDGET_EXCEEDED: 'STATE_CORRUPT',
  BOOK_SOURCE_MISSING: 'BOOK_NOT_FOUND',
  TXT_SOURCE_CHANGED: 'BOOK_CHANGED',
  TXT_LOCATOR_STALE: 'BOOK_CHANGED',
  TXT_DECODE_FAILED: 'ENCODING_INVALID',
  TXT_LOCATOR_INVALID: 'TXT_INDEX_INVALID',
  EPUB_INVALID_ARCHIVE: 'EPUB_INVALID_CONTAINER',
  EPUB_UNSAFE_PATH: 'EPUB_INVALID_CONTAINER',
  EPUB_UNSAFE_XML: 'EPUB_INVALID_CONTAINER',
};

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function normalizeCode(error: unknown): ErrorCode {
  const rawCode = errorCodeOf(error);
  if (rawCode === undefined) return 'UNKNOWN_ERROR';
  if (rawCode === 'UNKNOWN_ERROR') return rawCode;
  if (ERROR_CODE_SET.has(rawCode)) return rawCode as StableErrorCode;
  return CODE_ALIASES[rawCode] ?? 'UNKNOWN_ERROR';
}

/**
 * Converts arbitrary failures into a bounded, path-free UI contract.
 * Neither `error.message` nor `error.stack` is returned to the Webview.
 */
export function present(error: unknown): PresentedError {
  const code = normalizeCode(error);
  return {
    code,
    message: SAFE_MESSAGES[code],
    actions: [...ACTIONS[code]],
  };
}
