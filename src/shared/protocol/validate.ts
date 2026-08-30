import { MAX_MESSAGE_BYTES } from './limits';
import {
  type AppSection,
  type Game2048State,
  type HostRequest,
  type LogicalLocator,
  type ProtocolError,
  type ProtocolErrorCode,
  PROTOCOL_VERSION,
} from './messages';
import { failure, success, type Result } from './result';

const ERROR_MESSAGES: Readonly<Record<ProtocolErrorCode, string>> = {
  INVALID_MESSAGE: 'Message could not be processed.',
  MESSAGE_TOO_LARGE: 'Message exceeds the maximum allowed size.',
  INVALID_ENVELOPE: 'Message envelope is invalid.',
  UNSUPPORTED_PROTOCOL: 'Protocol version is not supported.',
  INVALID_SESSION: 'Webview session is invalid.',
  UNKNOWN_REQUEST_TYPE: 'Request type is not supported.',
  INVALID_PAYLOAD: 'Request payload is invalid.',
};

const APP_SECTIONS: ReadonlySet<AppSection> = new Set([
  'books',
  'reader',
  'game2048',
  'settings',
]);
const GAME_STATUSES: ReadonlySet<Game2048State['status']> = new Set([
  'playing',
  'won',
  'lost',
]);

function protocolError(code: ProtocolErrorCode): Result<never, ProtocolError> {
  return failure({ code, message: ERROR_MESSAGES[code] });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key) => expectedKeys.includes(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isLogicalLocator(value: unknown): value is LogicalLocator {
  if (!isRecord(value)) {
    return false;
  }

  const commonFieldsAreValid =
    isNonEmptyString(value.contentFingerprint) &&
    isNonNegativeInteger(value.characterOffset);

  if (
    value.kind === 'txt' &&
    hasExactKeys(value, [
      'kind',
      'blockId',
      'characterOffset',
      'contentFingerprint',
    ])
  ) {
    return commonFieldsAreValid && isNonEmptyString(value.blockId);
  }

  if (
    value.kind === 'epub' &&
    hasExactKeys(value, [
      'kind',
      'chapterId',
      'paragraphIndex',
      'characterOffset',
      'contentFingerprint',
    ])
  ) {
    return (
      commonFieldsAreValid &&
      isNonEmptyString(value.chapterId) &&
      isNonNegativeInteger(value.paragraphIndex)
    );
  }

  return false;
}

function isPowerOfTwoTile(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    (value === 0 || (value & (value - 1)) === 0)
  );
}

function isGame2048State(value: unknown): value is Game2048State {
  if (!isRecord(value) || !hasExactKeys(value, ['board', 'score', 'status'])) {
    return false;
  }

  return (
    Array.isArray(value.board) &&
    value.board.length === 4 &&
    value.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        row.every((tile) => isPowerOfTwoTile(tile)),
    ) &&
    isNonNegativeInteger(value.score) &&
    typeof value.status === 'string' &&
    GAME_STATUSES.has(value.status as Game2048State['status'])
  );
}

function isPayloadForType(type: string, payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  switch (type) {
    case 'app/ready':
    case 'books/list':
      return hasExactKeys(payload, []);
    case 'app/navigate':
      return (
        hasExactKeys(payload, ['section']) &&
        typeof payload.section === 'string' &&
        APP_SECTIONS.has(payload.section as AppSection)
      );
    case 'reader/readBlocks':
      return (
        hasExactKeys(payload, ['bookId', 'anchor', 'direction', 'limit']) &&
        isNonEmptyString(payload.bookId) &&
        isLogicalLocator(payload.anchor) &&
        (payload.direction === 'before' || payload.direction === 'after') &&
        isNonNegativeInteger(payload.limit) &&
        payload.limit >= 1 &&
        payload.limit <= 100
      );
    case 'game2048/save':
      return (
        hasExactKeys(payload, ['baseVersion', 'state']) &&
        isNonNegativeInteger(payload.baseVersion) &&
        isGame2048State(payload.state)
      );
    default:
      return false;
  }
}

/** Returns the byte length of the JSON representation encoded as UTF-8. */
export function serializedUtf8Size(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Value is not JSON-serializable.');
  }
  return new TextEncoder().encode(serialized).byteLength;
}

/**
 * Validates an untrusted Webview request before it reaches an Extension Host handler.
 * Session freshness relative to a live panel is enforced by the receiving session registry.
 */
export function validateHostRequest(
  value: unknown,
): Result<HostRequest, ProtocolError> {
  try {
    if (serializedUtf8Size(value) > MAX_MESSAGE_BYTES) {
      return protocolError('MESSAGE_TOO_LARGE');
    }

    if (!isRecord(value) || !hasExactKeys(value, ['protocol', 'id', 'sessionId', 'type', 'payload'])) {
      return protocolError('INVALID_ENVELOPE');
    }
    if (value.protocol !== PROTOCOL_VERSION) {
      return protocolError('UNSUPPORTED_PROTOCOL');
    }
    if (!isNonEmptyString(value.id)) {
      return protocolError('INVALID_ENVELOPE');
    }
    if (!isNonEmptyString(value.sessionId)) {
      return protocolError('INVALID_SESSION');
    }
    if (
      value.type !== 'app/ready' &&
      value.type !== 'app/navigate' &&
      value.type !== 'books/list' &&
      value.type !== 'reader/readBlocks' &&
      value.type !== 'game2048/save'
    ) {
      return protocolError('UNKNOWN_REQUEST_TYPE');
    }
    if (!isPayloadForType(value.type, value.payload)) {
      return protocolError('INVALID_PAYLOAD');
    }

    // The preceding exact envelope, discriminant, and payload guards establish
    // the closed union; TypeScript cannot infer that correlation from a record.
    return success(value as unknown as HostRequest);
  } catch {
    return protocolError('INVALID_MESSAGE');
  }
}
