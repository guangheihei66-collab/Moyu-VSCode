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
