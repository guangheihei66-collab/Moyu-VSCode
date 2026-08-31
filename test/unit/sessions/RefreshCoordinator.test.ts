import { describe, expect, it, vi } from 'vitest';

import { RefreshCoordinator } from '../../../src/application/sessions/RefreshCoordinator';
import { WebviewSessionRegistry } from '../../../src/application/sessions/WebviewSessionRegistry';

const event = {
  protocol: 1,
  id: 'event-1',
  sessionId: 'session-a',
  type: 'app/notice',
  payload: { message: 'Bookshelf changed.' },
} as const;

describe('WebviewSessionRegistry', () => {
  it('broadcasts only to registered sessions in this Extension Host', () => {
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    const registry = new WebviewSessionRegistry();
    const unregisterFirst = registry.register('session-a', first.postMessage);
    registry.register('session-b', second.postMessage);

    registry.broadcast(event);
    expect(first.postMessage).toHaveBeenCalledWith(event);
    expect(second.postMessage).toHaveBeenCalledWith(event);

    unregisterFirst();
    registry.broadcast(event);
    expect(first.postMessage).toHaveBeenCalledTimes(1);
    expect(second.postMessage).toHaveBeenCalledTimes(2);
  });
});

describe('RefreshCoordinator', () => {
  it('rereads the locked repository at every declared refresh point', async () => {
    const repository = {
      readLatest: vi.fn(async () => ({ version: 4 })),
    };
    const coordinator = new RefreshCoordinator({ bookshelf: repository });

    await expect(coordinator.onCreated('bookshelf')).resolves.toEqual({
      version: 4,
    });
    await coordinator.onRevealed('bookshelf');
    await coordinator.onNavigated('bookshelf');
    await coordinator.beforeMutation('bookshelf');

    expect(repository.readLatest).toHaveBeenCalledTimes(4);
  });

  it('does not claim a cross-process session channel', () => {
    const coordinator = new RefreshCoordinator({
      bookshelf: { readLatest: async () => undefined },
    });

    expect(
      (coordinator as unknown as { forOtherProcess?: unknown }).forOtherProcess,
    ).toBeUndefined();
  });

  it('cancels a refresh while a repository read is still pending', async () => {
    const controller = new AbortController();
    const repository = {
      readLatest: vi.fn(() => new Promise<{ version: number }>(() => {})),
    };
    const coordinator = new RefreshCoordinator({ bookshelf: repository });
    const refresh = coordinator.beforeMutation('bookshelf', controller.signal);

    controller.abort();

    await expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
  });
});
