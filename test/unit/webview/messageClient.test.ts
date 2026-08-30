import { describe, expect, it, vi } from 'vitest';
import { MessageClient } from '../../../webview/shell/messageClient';
import { DEFAULT_READER_SETTINGS } from '../../../src/domain/reader/settings';

const request = {
  protocol: 1 as const,
  id: 'request-1',
  sessionId: 'session-1',
  type: 'books/list' as const,
  payload: {},
};

describe('MessageClient', () => {
  it('correlates responses by request id', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(api);
    const result = client.request(request);
    client.handleMessage({
      protocol: 1,
      id: 'response-1',
      sessionId: 'session-1',
      type: 'response/success',
      payload: { requestId: request.id },
    });
    await expect(result).resolves.toMatchObject({
      payload: { requestId: request.id },
    });
    expect(api.postMessage).toHaveBeenCalledWith(request);
  });

  it('reads a typed settings snapshot through a correlated request', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => 'settings-read-1',
    );

    const result = client.readSettings();
    expect(api.postMessage).toHaveBeenCalledWith({
      protocol: 1,
      id: 'settings-read-1',
      sessionId: 'session-1',
      type: 'settings/read',
      payload: {},
    });
    expect(
      client.handleMessage({
        protocol: 1,
        id: 'settings-response-1',
        sessionId: 'session-1',
        type: 'settings/snapshot',
        payload: {
          requestId: 'settings-read-1',
          snapshot: { version: 3, settings: DEFAULT_READER_SETTINGS },
        },
      }),
    ).toBe(true);

    await expect(result).resolves.toEqual({
      version: 3,
      settings: DEFAULT_READER_SETTINGS,
    });
  });

  it('updates settings with the latest base version and returns the snapshot', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => 'settings-update-1',
    );

    const result = client.updateSettings(3, { contentWidth: 900 });
    expect(api.postMessage).toHaveBeenCalledWith({
      protocol: 1,
      id: 'settings-update-1',
      sessionId: 'session-1',
      type: 'settings/update',
      payload: { baseVersion: 3, patch: { contentWidth: 900 } },
    });
    client.handleMessage({
      protocol: 1,
      id: 'settings-response-2',
      sessionId: 'session-1',
      type: 'settings/snapshot',
      payload: {
        requestId: 'settings-update-1',
        snapshot: {
          version: 4,
          settings: { ...DEFAULT_READER_SETTINGS, contentWidth: 900 },
        },
      },
    });

    await expect(result).resolves.toMatchObject({
      version: 4,
      settings: { contentWidth: 900 },
    });
  });

  it('ignores valid responses from a stale Webview session', () => {
    const client = new MessageClient(
      { postMessage: vi.fn() },
      'session-current',
    );

    expect(
      client.handleMessage({
        protocol: 1,
        id: 'response-stale',
        sessionId: 'session-stale',
        type: 'response/success',
        payload: { requestId: 'request-1' },
      }),
    ).toBe(false);
  });
});
