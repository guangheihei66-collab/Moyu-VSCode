import { MAX_MESSAGE_BYTES } from './limits';
import {
  type AppSection,
  type Game2048State,
  type HostRequest,
  type HostResponse,
  type HostEvent,
  type LogicalLocator,
  type ProtocolError,
  type ProtocolErrorCode,
  PROTOCOL_VERSION,
} from './messages';
import { failure, success, type Result } from './result';
import {
  isReaderSettings,
  validateSettings,
} from '../../domain/reader/settings';

const ERROR_MESSAGES: Readonly<Record<ProtocolErrorCode, string>> = {
  INVALID_MESSAGE: 'Message could not be processed.',
  MESSAGE_TOO_LARGE: 'Message exceeds the maximum allowed size.',
  INVALID_ENVELOPE: 'Message envelope is invalid.',
  UNSUPPORTED_PROTOCOL: 'Protocol version is not supported.',
  INVALID_SESSION: 'Webview session is invalid.',
  STALE_SESSION: 'Webview session is no longer current.',
  UNKNOWN_REQUEST_TYPE: 'Request type is not supported.',
  UNKNOWN_RESPONSE_TYPE: 'Response type is not supported.',
  UNKNOWN_EVENT_TYPE: 'Event type is not supported.',
  INVALID_PAYLOAD: 'Request payload is invalid.',
};

const APP_SECTIONS: ReadonlySet<AppSection> = new Set([
  'books',
  'reader',
  'game2048',
  'settings',
]);
const BOSS_MODES = new Set(['NORMAL', 'BOSS_MODE']);
const BOSS_TEMPLATES = new Set(['typescript', 'json', 'buildLog']);
const MAX_2048_TILE = 2 ** 52;

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
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_2048_TILE
  ) {
    return false;
  }

  let remaining = value;
  while (remaining > 1) {
    if (remaining % 2 !== 0) {
      return false;
    }
    remaining /= 2;
  }
  return true;
}

function isGame2048State(value: unknown): value is Game2048State {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'gameSessionId',
      'board',
      'score',
      'bestScore',
      'won',
      'gameOver',
      'moveSequence',
      'startedAt',
      'updatedAt',
      'stateVersion',
    ])
  ) {
    return false;
  }

  return (
    isNonEmptyString(value.gameSessionId) &&
    Array.isArray(value.board) &&
    value.board.length === 4 &&
    value.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        row.every((tile) => isPowerOfTwoTile(tile)),
    ) &&
    isNonNegativeInteger(value.score) &&
    isNonNegativeInteger(value.bestScore) &&
    typeof value.won === 'boolean' &&
    typeof value.gameOver === 'boolean' &&
    isNonNegativeInteger(value.moveSequence) &&
    isNonNegativeInteger(value.startedAt) &&
    isNonNegativeInteger(value.updatedAt) &&
    isNonNegativeInteger(value.stateVersion) &&
    value.stateVersion > 0
  );
}

function isReaderBlockBatch(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['blocks', 'atStart', 'atEnd'])
  ) {
    return false;
  }
  return (
    Array.isArray(value.blocks) &&
    value.blocks.every(
      (block) =>
        isRecord(block) &&
        hasExactKeys(block, [
          'id',
          'paragraphs',
          'decodedLength',
          'contentFingerprint',
        ]) &&
        isNonEmptyString(block.id) &&
        Array.isArray(block.paragraphs) &&
        block.paragraphs.every((paragraph) => typeof paragraph === 'string') &&
        isNonNegativeInteger(block.decodedLength) &&
        isNonEmptyString(block.contentFingerprint),
    ) &&
    typeof value.atStart === 'boolean' &&
    typeof value.atEnd === 'boolean'
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
    case 'boss/ack':
      return (
        hasExactKeys(payload, ['requestId', 'mode']) &&
        isNonEmptyString(payload.requestId) &&
        typeof payload.mode === 'string' &&
        BOSS_MODES.has(payload.mode)
      );
    case 'app/navigate':
      return (
        hasExactKeys(payload, ['section']) &&
        typeof payload.section === 'string' &&
        APP_SECTIONS.has(payload.section as AppSection)
      );
    case 'books/import':
      return hasExactKeys(payload, ['uri']) && isNonEmptyString(payload.uri);
    case 'books/remove':
    case 'books/selectEncoding':
    case 'reader/open':
      return (
        hasExactKeys(payload, ['bookId']) && isNonEmptyString(payload.bookId)
      );
    case 'books/relocate':
      return (
        hasExactKeys(payload, ['bookId', 'uri']) &&
        isNonEmptyString(payload.bookId) &&
        isNonEmptyString(payload.uri)
      );
    case 'settings/read':
      return hasExactKeys(payload, []);
    case 'settings/update':
      return (
        hasExactKeys(payload, ['baseVersion', 'patch']) &&
        isNonNegativeInteger(payload.baseVersion) &&
        isRecord(payload.patch) &&
        validateSettings(payload.patch).ok
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
    case 'reader/saveProgress':
      return (
        hasExactKeys(payload, ['bookId', 'baseVersion', 'locator']) &&
        isNonEmptyString(payload.bookId) &&
        isNonNegativeInteger(payload.baseVersion) &&
        isLogicalLocator(payload.locator)
      );
    case 'game2048/load':
      return hasExactKeys(payload, []);
    case 'game2048/newGame':
      return (
        hasExactKeys(payload, ['baseVersion']) &&
        isNonNegativeInteger(payload.baseVersion)
      );
    case 'game2048/move':
      return (
        hasExactKeys(payload, [
          'baseVersion',
          'sessionId',
          'moveSequence',
          'direction',
        ]) &&
        isNonNegativeInteger(payload.baseVersion) &&
        isNonEmptyString(payload.sessionId) &&
        isNonNegativeInteger(payload.moveSequence) &&
        (payload.direction === 'left' ||
          payload.direction === 'right' ||
          payload.direction === 'up' ||
          payload.direction === 'down')
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

function isProtocolError(value: unknown): value is ProtocolError {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['code', 'message']) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, value.code) &&
    ERROR_MESSAGES[value.code as ProtocolErrorCode] === value.message
  );
}

function isResponsePayloadForType(type: string, payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  switch (type) {
    case 'response/success':
      return (
        hasExactKeys(payload, ['requestId']) &&
        isNonEmptyString(payload.requestId)
      );
    case 'settings/snapshot':
      return (
        hasExactKeys(payload, ['requestId', 'snapshot']) &&
        isNonEmptyString(payload.requestId) &&
        isRecord(payload.snapshot) &&
        hasExactKeys(payload.snapshot, ['version', 'settings']) &&
        isNonNegativeInteger(payload.snapshot.version) &&
        isReaderSettings(payload.snapshot.settings)
      );
    case 'reader/opened':
      return (
        hasExactKeys(payload, ['requestId', 'snapshot']) &&
        isNonEmptyString(payload.requestId) &&
        isRecord(payload.snapshot) &&
        hasExactKeys(payload.snapshot, ['bookId', 'version', 'anchor']) &&
        isNonEmptyString(payload.snapshot.bookId) &&
        isNonNegativeInteger(payload.snapshot.version) &&
        (payload.snapshot.anchor === null ||
          isLogicalLocator(payload.snapshot.anchor))
      );
    case 'reader/blocks':
      return (
        hasExactKeys(payload, ['requestId', 'batch']) &&
        isNonEmptyString(payload.requestId) &&
        isReaderBlockBatch(payload.batch)
      );
    case 'reader/progressSaved':
      return (
        hasExactKeys(payload, ['requestId', 'snapshot']) &&
        isNonEmptyString(payload.requestId) &&
        isRecord(payload.snapshot) &&
        hasExactKeys(payload.snapshot, ['version', 'locator']) &&
        isNonNegativeInteger(payload.snapshot.version) &&
        isLogicalLocator(payload.snapshot.locator)
      );
    case 'game2048/session':
      return (
        hasExactKeys(payload, ['requestId', 'session']) &&
        isNonEmptyString(payload.requestId) &&
        (payload.session === null ||
          (isRecord(payload.session) &&
            hasExactKeys(payload.session, ['version', 'state']) &&
            isNonNegativeInteger(payload.session.version) &&
            isGame2048State(payload.session.state)))
      );
    case 'response/error':
      return (
        hasExactKeys(payload, ['requestId', 'error']) &&
        isNonEmptyString(payload.requestId) &&
        isProtocolError(payload.error)
      );
    default:
      return false;
  }
}

function isEventPayloadForType(type: string, payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  switch (type) {
    case 'app/error':
      return hasExactKeys(payload, ['error']) && isProtocolError(payload.error);
    case 'app/notice':
      return (
        hasExactKeys(payload, ['message']) &&
        typeof payload.message === 'string'
      );
    case 'app/navigate':
      return (
        hasExactKeys(payload, ['section']) &&
        typeof payload.section === 'string' &&
        APP_SECTIONS.has(payload.section as AppSection)
      );
    case 'boss/modeChanged':
      return (
        hasExactKeys(payload, ['requestId', 'mode', 'template']) &&
        isNonEmptyString(payload.requestId) &&
        typeof payload.mode === 'string' &&
        BOSS_MODES.has(payload.mode) &&
        typeof payload.template === 'string' &&
        BOSS_TEMPLATES.has(payload.template)
      );
    default:
      return false;
  }
}

function validateEnvelope(
  value: unknown,
): Result<Record<string, unknown>, ProtocolError> {
  if (serializedUtf8Size(value) > MAX_MESSAGE_BYTES) {
    return protocolError('MESSAGE_TOO_LARGE');
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['protocol', 'id', 'sessionId', 'type', 'payload'])
  ) {
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

  return success(value);
}

/** Returns the byte length of the JSON representation encoded as UTF-8. */
export function serializedUtf8Size(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('Value is not JSON-serializable.');
  }
  return new TextEncoder().encode(serialized).byteLength;
}

/** Validates an untrusted Webview request before it reaches a Host handler. */
export function validateHostRequest(
  value: unknown,
  expectedSessionId: string,
): Result<HostRequest, ProtocolError> {
  try {
    if (!isNonEmptyString(expectedSessionId)) {
      return protocolError('INVALID_SESSION');
    }
    const envelope = validateEnvelope(value);
    if (!envelope.ok) {
      return envelope;
    }
    if (envelope.value.sessionId !== expectedSessionId) {
      return protocolError('STALE_SESSION');
    }
    if (
      envelope.value.type !== 'app/ready' &&
      envelope.value.type !== 'boss/ack' &&
      envelope.value.type !== 'app/navigate' &&
      envelope.value.type !== 'books/list' &&
      envelope.value.type !== 'books/import' &&
      envelope.value.type !== 'books/remove' &&
      envelope.value.type !== 'books/relocate' &&
      envelope.value.type !== 'books/selectEncoding' &&
      envelope.value.type !== 'reader/open' &&
      envelope.value.type !== 'settings/read' &&
      envelope.value.type !== 'settings/update' &&
      envelope.value.type !== 'reader/readBlocks' &&
      envelope.value.type !== 'reader/saveProgress' &&
      envelope.value.type !== 'game2048/load' &&
      envelope.value.type !== 'game2048/newGame' &&
      envelope.value.type !== 'game2048/move' &&
      envelope.value.type !== 'game2048/save'
    ) {
      return protocolError('UNKNOWN_REQUEST_TYPE');
    }
    if (!isPayloadForType(envelope.value.type, envelope.value.payload)) {
      return protocolError('INVALID_PAYLOAD');
    }

    // The preceding exact envelope, discriminant, and payload guards establish
    // the closed union; TypeScript cannot infer that correlation from a record.
    return success(envelope.value as unknown as HostRequest);
  } catch {
    return protocolError('INVALID_MESSAGE');
  }
}

/** Validates a Host response before it is transported to the Webview. */
export function validateHostResponse(
  value: unknown,
): Result<HostResponse, ProtocolError> {
  try {
    const envelope = validateEnvelope(value);
    if (!envelope.ok) {
      return envelope;
    }
    if (
      envelope.value.type !== 'response/success' &&
      envelope.value.type !== 'settings/snapshot' &&
      envelope.value.type !== 'reader/opened' &&
      envelope.value.type !== 'reader/blocks' &&
      envelope.value.type !== 'reader/progressSaved' &&
      envelope.value.type !== 'game2048/session' &&
      envelope.value.type !== 'response/error'
    ) {
      return protocolError('UNKNOWN_RESPONSE_TYPE');
    }
    if (
      !isResponsePayloadForType(envelope.value.type, envelope.value.payload)
    ) {
      return protocolError('INVALID_PAYLOAD');
    }

    return success(envelope.value as unknown as HostResponse);
  } catch {
    return protocolError('INVALID_MESSAGE');
  }
}

/** Validates a Host event before it is transported to the Webview. */
export function validateHostEvent(
  value: unknown,
): Result<HostEvent, ProtocolError> {
  try {
    const envelope = validateEnvelope(value);
    if (!envelope.ok) {
      return envelope;
    }
    if (
      envelope.value.type !== 'app/error' &&
      envelope.value.type !== 'app/notice' &&
      envelope.value.type !== 'app/navigate' &&
      envelope.value.type !== 'boss/modeChanged'
    ) {
      return protocolError('UNKNOWN_EVENT_TYPE');
    }
    if (!isEventPayloadForType(envelope.value.type, envelope.value.payload)) {
      return protocolError('INVALID_PAYLOAD');
    }

    return success(envelope.value as unknown as HostEvent);
  } catch {
    return protocolError('INVALID_MESSAGE');
  }
}
