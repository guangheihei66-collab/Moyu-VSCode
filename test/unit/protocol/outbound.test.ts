import { describe, expect, it } from 'vitest';

import { MAX_MESSAGE_BYTES } from '../../../src/shared/protocol/limits';
import {
  serializedUtf8Size,
  validateHostEvent,
  validateHostResponse,
} from '../../../src/shared/protocol/validate';

function response(id: string) {
  return {
    protocol: 1,
    id,
    sessionId: 'webview-session-1',
    type: 'response/success' as const,
    payload: { requestId: 'request-1' },
  };
}

function notice(message: string) {
  return {
    protocol: 1,
    id: 'event-1',
    sessionId: 'webview-session-1',
    type: 'app/notice' as const,
    payload: { message },
  };
}

describe('outbound protocol validation', () => {
  it('accepts the initial closed response and event families', () => {
    expect(validateHostResponse(response('response-1'))).toMatchObject({
      ok: true,
    });
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'response-2',
        sessionId: 'webview-session-1',
        type: 'response/error',
        payload: {
          requestId: 'request-1',
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Request payload is invalid.',
          },
        },
      }),
    ).toMatchObject({ ok: true });
    expect(validateHostEvent(notice('Ready.'))).toMatchObject({ ok: true });
  });

  it('accepts the typed settings snapshot and navigation event', () => {
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'response-settings-1',
        sessionId: 'webview-session-1',
        type: 'settings/snapshot',
        payload: {
          requestId: 'request-1',
          snapshot: {
            version: 4,
            settings: {
              fontSize: 18,
              lineHeight: 1.8,
              contentWidth: 840,
              bossTemplate: 'json',
            },
          },
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateHostEvent({
        protocol: 1,
        id: 'event-navigation-1',
        sessionId: 'webview-session-1',
        type: 'app/navigate',
        payload: { section: 'settings' },
      }),
    ).toMatchObject({ ok: true });
  });

  it('accepts correlated durable reader and 2048 response snapshots', () => {
    const readerAnchor = {
      kind: 'txt',
      blockId: 'block-7',
      characterOffset: 9,
      contentFingerprint: 'block-fingerprint-7',
    } as const;
    const gameState = {
      gameSessionId: 'durable-game-1',
      board: [
        [2, 4, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      score: 12,
      bestScore: 12,
      won: false,
      gameOver: false,
      moveSequence: 3,
      startedAt: 1,
      updatedAt: 2,
      stateVersion: 1,
    };

    expect(
      validateHostResponse({
        protocol: 1,
        id: 'reader-open-response',
        sessionId: 'webview-session-1',
        type: 'reader/opened',
        payload: {
          requestId: 'reader-open-request',
          snapshot: { bookId: 'book-1', version: 4, anchor: readerAnchor },
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'reader-blocks-response',
        sessionId: 'webview-session-1',
        type: 'reader/blocks',
        payload: {
          requestId: 'reader-blocks-request',
          batch: {
            blocks: [
              {
                id: 'block-7',
                paragraphs: ['A durable paragraph.'],
                decodedLength: 20,
                contentFingerprint: 'block-fingerprint-7',
              },
            ],
            atStart: false,
            atEnd: false,
          },
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'reader-progress-response',
        sessionId: 'webview-session-1',
        type: 'reader/progressSaved',
        payload: {
          requestId: 'reader-progress-request',
          snapshot: { version: 5, locator: readerAnchor },
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'game-session-response',
        sessionId: 'webview-session-1',
        type: 'game2048/session',
        payload: {
          requestId: 'game-load-request',
          session: { version: 6, state: gameState },
        },
      }),
    ).toMatchObject({ ok: true });
  });

  it('rejects incomplete durable module response payloads', () => {
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'reader-open-response',
        sessionId: 'webview-session-1',
        type: 'reader/opened',
        payload: {
          requestId: 'reader-open-request',
          snapshot: { bookId: 'book-1', version: 4 },
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'game-session-response',
        sessionId: 'webview-session-1',
        type: 'game2048/session',
        payload: {
          requestId: 'game-load-request',
          session: {
            version: 6,
            state: {
              gameSessionId: 'durable-game-1',
              board: [[2, 0, 0, 0]],
              score: 12,
              bestScore: 12,
              won: false,
              gameOver: false,
              moveSequence: 3,
              startedAt: 1,
              updatedAt: 2,
              stateVersion: 1,
            },
          },
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  });

  it.each([
    {
      protocol: 1,
      id: 'response-settings-1',
      sessionId: 'webview-session-1',
      type: 'settings/snapshot',
      payload: {
        requestId: 'request-1',
        snapshot: {
          version: 4,
          settings: {
            fontSize: 18.5,
            lineHeight: 1.8,
            contentWidth: 840,
            bossTemplate: 'json',
          },
        },
      },
    },
    {
      protocol: 1,
      id: 'response-settings-2',
      sessionId: 'webview-session-1',
      type: 'settings/snapshot',
      payload: {
        requestId: 'request-1',
        snapshot: {
          version: 4,
          settings: {
            fontSize: 18,
            lineHeight: 1.8,
            contentWidth: 840,
            bossTemplate: 'json',
          },
          extra: true,
        },
      },
    },
  ])('rejects malformed typed settings snapshots', (value) => {
    expect(validateHostResponse(value)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('keeps navigation events closed to exact sections and fields', () => {
    expect(
      validateHostEvent({
        protocol: 1,
        id: 'event-navigation-1',
        sessionId: 'webview-session-1',
        type: 'app/navigate',
        payload: { section: 'settings', extra: true },
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  });

  it.each([
    [
      validateHostResponse,
      {
        protocol: 1,
        id: 'response-1',
        sessionId: 'webview-session-1',
        type: 'response/debug',
        payload: {},
      },
      'UNKNOWN_RESPONSE_TYPE',
    ],
    [
      validateHostResponse,
      {
        protocol: 1,
        id: 'response-1',
        sessionId: 'webview-session-1',
        type: 'response/success',
        payload: { requestId: 'request-1', data: { privateValue: true } },
      },
      'INVALID_PAYLOAD',
    ],
    [
      validateHostEvent,
      {
        protocol: 1,
        id: 'event-1',
        sessionId: 'webview-session-1',
        type: 'app/raw',
        payload: {},
      },
      'UNKNOWN_EVENT_TYPE',
    ],
    [
      validateHostEvent,
      {
        protocol: 1,
        id: 'event-1',
        sessionId: 'webview-session-1',
        type: 'app/error',
        payload: {
          error: { code: 'INTERNAL', message: 'C:\\private\\book.txt' },
        },
      },
      'INVALID_PAYLOAD',
    ],
  ])('rejects unsafe outbound messages with $2', (validate, value, code) => {
    expect(validate(value)).toMatchObject({ ok: false, error: { code } });
  });

  it('accepts an exactly 1 MiB response and event', () => {
    const responsePrefix = serializedUtf8Size(response(''));
    const exactResponse = response(
      'x'.repeat(MAX_MESSAGE_BYTES - responsePrefix),
    );
    const noticePrefix = serializedUtf8Size(notice(''));
    const exactNotice = notice('x'.repeat(MAX_MESSAGE_BYTES - noticePrefix));

    expect(serializedUtf8Size(exactResponse)).toBe(MAX_MESSAGE_BYTES);
    expect(validateHostResponse(exactResponse)).toMatchObject({ ok: true });
    expect(serializedUtf8Size(exactNotice)).toBe(MAX_MESSAGE_BYTES);
    expect(validateHostEvent(exactNotice)).toMatchObject({ ok: true });
  });

  it('rejects an outbound response and event one byte over the cap', () => {
    const responsePrefix = serializedUtf8Size(response(''));
    const oversizedResponse = response(
      'x'.repeat(MAX_MESSAGE_BYTES - responsePrefix + 1),
    );
    const noticePrefix = serializedUtf8Size(notice(''));
    const oversizedNotice = notice(
      'x'.repeat(MAX_MESSAGE_BYTES - noticePrefix + 1),
    );

    expect(validateHostResponse(oversizedResponse)).toMatchObject({
      ok: false,
      error: { code: 'MESSAGE_TOO_LARGE' },
    });
    expect(validateHostEvent(oversizedNotice)).toMatchObject({
      ok: false,
      error: { code: 'MESSAGE_TOO_LARGE' },
    });
  });
});
