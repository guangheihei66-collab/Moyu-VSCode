import { describe, expect, it, vi } from 'vitest';

import type { Game2048State } from '../../../src/domain/game2048/types';
import { Router } from '../../../webview/shell/router';
import {
  validateHostEvent,
  validateHostRequest,
} from '../../../src/shared/protocol/validate';
import {
  ModuleLifecycle,
  type ModuleBinding,
} from '../../../webview/shell/moduleLifecycle';

function gameState(): Game2048State {
  return {
    gameSessionId: 'session-1',
    board: [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    score: 28,
    bestScore: 28,
    won: false,
    gameOver: false,
    moveSequence: 3,
    startedAt: 1,
    updatedAt: 2,
    stateVersion: 1,
  };
}

describe('ModuleLifecycle restoration', () => {
  it('restores the exact reader locator, focus, controller, and timer state', () => {
    const router = new Router().navigate('reader');
    const controller = { kind: 'reader' };
    const locator = { blockId: 'block-42', characterOffset: 9 };
    const restoreAnchor = vi.fn();
    const restoreFocus = vi.fn();
    let timerPaused = false;
    const binding: ModuleBinding = {
      id: 'reader:book-1',
      controller,
      captureFocus: () => 'paragraph:block-42',
      restoreFocus,
      captureAnchor: () => locator,
      restoreAnchor,
      captureState: () => locator,
      pause: () => {
        timerPaused = true;
      },
      resume: () => {
        timerPaused = false;
      },
    };
    const lifecycle = new ModuleLifecycle(router, () => binding);

    const snapshot = lifecycle.capture();
    lifecycle.pause();
    expect(timerPaused).toBe(true);
    lifecycle.resume(snapshot);

    expect(snapshot.controller).toBe(controller);
    expect(snapshot.moduleState).toBe(locator);
    expect(restoreAnchor).toHaveBeenCalledWith(locator);
    expect(restoreFocus).toHaveBeenCalledWith('paragraph:block-42');
    expect(timerPaused).toBe(false);
  });

  it('preserves the exact 2048 controller and board state object', () => {
    const router = new Router().navigate('game2048');
    const controller = { kind: 'game2048' };
    const state = gameState();
    const pause = vi.fn();
    const resume = vi.fn();
    const binding: ModuleBinding = {
      id: 'game2048:session-1',
      controller,
      captureFocus: () => 'board',
      restoreFocus: vi.fn(),
      captureAnchor: () => 'cell:0',
      restoreAnchor: vi.fn(),
      captureState: () => state,
      pause,
      resume,
    };
    const lifecycle = new ModuleLifecycle(router, () => binding);

    const snapshot = lifecycle.capture();
    lifecycle.pause();
    lifecycle.resume(snapshot);

    expect(snapshot.controller).toBe(controller);
    expect(snapshot.moduleState).toBe(state);
    expect((snapshot.moduleState as Game2048State).board).toBe(state.board);
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('fails closed instead of restoring a recreated module', () => {
    const router = new Router().navigate('reader');
    const original = {
      id: 'reader:book-1',
      controller: {},
      pause: vi.fn(),
      resume: vi.fn(),
    } satisfies ModuleBinding;
    let current: ModuleBinding = original;
    const lifecycle = new ModuleLifecycle(router, () => current);
    const snapshot = lifecycle.capture();
    current = { ...original, controller: {} };

    expect(() => lifecycle.resume(snapshot)).toThrow(
      'Active module identity changed during Boss Mode.',
    );
    expect(current.resume).not.toHaveBeenCalled();
  });

  it('checks identity before returning a changed route to its captured module', () => {
    const router = new Router().navigate('reader');
    const original = {
      id: 'reader:book-1',
      controller: {},
      pause: vi.fn(),
      resume: vi.fn(),
    } satisfies ModuleBinding;
    let current: ModuleBinding = original;
    const lifecycle = new ModuleLifecycle(router, () => current);
    const snapshot = lifecycle.capture();
    router.navigate('game2048');
    current = { ...original, controller: {} };

    expect(() => lifecycle.resume(snapshot)).toThrow(
      'Active module identity changed during Boss Mode.',
    );
    expect(router.current).toBe('game2048');
  });
});

describe('boss mode protocol', () => {
  const envelope = {
    protocol: 1,
    id: 'boss-message-1',
    sessionId: 'webview-session-1',
  } as const;

  it('accepts only the closed transition event and acknowledgement request', () => {
    expect(
      validateHostEvent({
        ...envelope,
        type: 'boss/modeChanged',
        payload: {
          requestId: 'boss-request-1',
          mode: 'BOSS_MODE',
          template: 'buildLog',
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateHostRequest(
        {
          ...envelope,
          type: 'boss/ack',
          payload: { requestId: 'boss-request-1', mode: 'BOSS_MODE' },
        },
        envelope.sessionId,
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    {
      ...envelope,
      type: 'boss/modeChanged',
      payload: {
        requestId: 'boss-request-1',
        mode: 'BOSS_MODE',
        template: 'random',
      },
    },
    {
      ...envelope,
      type: 'boss/modeChanged',
      payload: {
        requestId: 'boss-request-1',
        mode: 'NORMAL',
        template: 'typescript',
        source: 'user',
      },
    },
  ])('rejects malformed transition events', (value) => {
    expect(validateHostEvent(value)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });
});
