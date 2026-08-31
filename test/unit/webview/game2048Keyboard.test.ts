import { describe, expect, it, vi } from 'vitest';
import {
  directionForKey,
  handleGameKey,
} from '../../../webview/game2048/keyboard';

describe('2048 keyboard scope', () => {
  it('maps arrows and WASD to directions', () => {
    expect(directionForKey('ArrowLeft')).toBe('left');
    expect(directionForKey('A')).toBe('left');
    expect(directionForKey('x')).toBeUndefined();
  });

  it('prevents only active board movement and ignores paused/text input paths', () => {
    const preventDefault = vi.fn();
    const onMove = vi.fn();
    expect(
      handleGameKey({ key: 'ArrowLeft', preventDefault }, true, false, onMove),
    ).toBe(true);
    expect(
      handleGameKey({ key: 'a', preventDefault }, false, false, onMove),
    ).toBe(false);
    expect(
      handleGameKey({ key: 'd', preventDefault }, true, true, onMove),
    ).toBe(false);
    expect(onMove).toHaveBeenCalledWith('left');
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('does not invoke browser alerts or route keyboard input outside the board', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const onMove = vi.fn();
    const preventDefault = vi.fn();

    expect(
      handleGameKey(
        { key: 'ArrowRight', preventDefault },
        false,
        false,
        onMove,
      ),
    ).toBe(false);
    expect(
      handleGameKey({ key: 'w', preventDefault }, true, true, onMove),
    ).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
