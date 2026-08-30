import { describe, expect, it } from 'vitest';

import { validateHostRequest } from '../../../src/shared/protocol/validate';

const envelope = {
  protocol: 1,
  id: 'request-1',
  sessionId: 'webview-session-1',
};

function validateForCurrentSession(value: unknown) {
  return validateHostRequest(value, envelope.sessionId);
}

describe('validateHostRequest', () => {
  it.each([
    { type: 'app/ready', payload: {} },
    { type: 'app/navigate', payload: { section: 'books' } },
    { type: 'books/list', payload: {} },
    {
      type: 'reader/readBlocks',
      payload: {
        bookId: 'book-1',
        anchor: {
          kind: 'txt',
          blockId: 'block-3',
          characterOffset: 0,
          contentFingerprint: 'fp-1',
        },
        direction: 'after',
        limit: 20,
      },
    },
    {
      type: 'game2048/save',
      payload: {
        baseVersion: 3,
        state: {
          board: [
            [2, 0, 0, 0],
            [0, 4, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
          score: 12,
          status: 'playing',
        },
      },
    },
  ])('accepts the closed $type request contract', (request) => {
    const result = validateForCurrentSession({ ...envelope, ...request });

    expect(result).toEqual({ ok: true, value: { ...envelope, ...request } });
  });

  it('rejects a syntactically valid request from a stale receiving session', () => {
    const result = validateHostRequest(
      { ...envelope, type: 'books/list', payload: {} },
      'current-webview-session',
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'STALE_SESSION',
        message: 'Webview session is no longer current.',
      },
    });
  });

  it('rejects an untyped dispatch call that omits the expected session ID', () => {
    const untypedDispatchValidator = validateHostRequest as unknown as (
      value: unknown,
      expectedSessionId?: string,
    ) => ReturnType<typeof validateHostRequest>;

    expect(
      untypedDispatchValidator({
        ...envelope,
        type: 'books/list',
        payload: {},
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'INVALID_SESSION',
        message: 'Webview session is invalid.',
      },
    });
  });

  it.each([
    [
      { ...envelope, protocol: 2, type: 'books/list', payload: {} },
      'UNSUPPORTED_PROTOCOL',
    ],
    [{ ...envelope, type: 'unknown/run', payload: {} }, 'UNKNOWN_REQUEST_TYPE'],
    [{ protocol: 1, type: 'books/list', payload: {} }, 'INVALID_ENVELOPE'],
    [
      { ...envelope, sessionId: '', type: 'books/list', payload: {} },
      'INVALID_SESSION',
    ],
    [
      { ...envelope, type: 'books/list', payload: { unexpected: true } },
      'INVALID_PAYLOAD',
    ],
    [
      {
        ...envelope,
        type: 'reader/readBlocks',
        payload: {
          bookId: 'book-1',
          anchor: {
            kind: 'txt',
            blockId: 'block-3',
            characterOffset: -1,
            contentFingerprint: 'fp-1',
          },
          direction: 'after',
          limit: 20,
        },
      },
      'INVALID_PAYLOAD',
    ],
    [
      {
        ...envelope,
        type: 'reader/readBlocks',
        payload: {
          bookId: 'book-1',
          anchor: {
            kind: 'txt',
            blockId: 'block-3',
            characterOffset: 0,
            contentFingerprint: 'fp-1',
          },
          direction: 'after',
          limit: 101,
        },
      },
      'INVALID_PAYLOAD',
    ],
    [
      {
        ...envelope,
        type: 'game2048/save',
        payload: {
          baseVersion: 3,
          state: {
            board: [[2, 0, 0, 0]],
            score: 12,
            status: 'playing',
          },
        },
      },
      'INVALID_PAYLOAD',
    ],
    [
      {
        ...envelope,
        type: 'game2048/save',
        payload: {
          baseVersion: 3,
          state: {
            board: [
              [2, 0, 0, 0],
              [0, 3, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            score: 12,
            status: 'playing',
          },
        },
      },
      'INVALID_PAYLOAD',
    ],
    [
      {
        ...envelope,
        type: 'game2048/save',
        payload: {
          baseVersion: 3,
          state: {
            board: [
              [4_294_967_297, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            score: 12,
            status: 'playing',
          },
        },
      },
      'INVALID_PAYLOAD',
    ],
    [
      {
        ...envelope,
        type: 'game2048/save',
        payload: {
          baseVersion: 3,
          state: {
            board: [
              [2 ** 53, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            score: 12,
            status: 'playing',
          },
        },
      },
      'INVALID_PAYLOAD',
    ],
  ])('rejects unsafe input with safe $1 errors', (value, code) => {
    const result = validateForCurrentSession(value);

    expect(result).toMatchObject({ ok: false, error: { code } });
    if (!result.ok) {
      expect(result.error.message).not.toMatch(
        /request-1|webview-session-1|book-1/,
      );
    }
  });

  it('accepts the largest safe integer power-of-two board tile', () => {
    const result = validateForCurrentSession({
      ...envelope,
      type: 'game2048/save',
      payload: {
        baseVersion: 3,
        state: {
          board: [
            [2 ** 52, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
          score: 12,
          status: 'playing',
        },
      },
    });

    expect(result).toMatchObject({ ok: true });
  });
});
