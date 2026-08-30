import { describe, expect, it, vi } from 'vitest';
import { MessageClient } from '../../../webview/shell/messageClient';

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
});
