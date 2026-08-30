import { describe, expect, it } from 'vitest';

import { MAX_MESSAGE_BYTES } from '../../../src/shared/protocol/limits';
import {
  serializedUtf8Size,
  validateHostRequest,
} from '../../../src/shared/protocol/validate';

function readyMessage(id: string) {
  return {
    protocol: 1,
    id,
    sessionId: 'webview-session-1',
    type: 'app/ready' as const,
    payload: {},
  };
}

describe('serializedUtf8Size', () => {
  it('counts JSON UTF-8 bytes rather than JavaScript string length', () => {
    expect(serializedUtf8Size({ value: '你' })).toBe(15);
  });

  it('accepts a serialized request of exactly 1 MiB', () => {
    const prefixSize = serializedUtf8Size(readyMessage(''));
    const request = readyMessage('x'.repeat(MAX_MESSAGE_BYTES - prefixSize));

    expect(serializedUtf8Size(request)).toBe(MAX_MESSAGE_BYTES);
    expect(validateHostRequest(request)).toMatchObject({ ok: true });
  });

  it('rejects a serialized request one byte larger than 1 MiB before dispatch', () => {
    const prefixSize = serializedUtf8Size(readyMessage(''));
    const request = readyMessage('x'.repeat(MAX_MESSAGE_BYTES - prefixSize + 1));

    expect(serializedUtf8Size(request)).toBe(MAX_MESSAGE_BYTES + 1);
    expect(validateHostRequest(request)).toEqual({
      ok: false,
      error: {
        code: 'MESSAGE_TOO_LARGE',
        message: 'Message exceeds the maximum allowed size.',
      },
    });
  });
});
