import { describe, expect, it, vi } from 'vitest';
import { PanelRegistry } from '../../../src/extension/panel/PanelRegistry';

describe('PanelRegistry', () => {
  it('creates one panel per window and routes later navigation to it', async () => {
    const panel = { open: vi.fn(), isVisible: true };
    const factory = vi.fn(() => panel);
    const contextKeys = { set: vi.fn(), clear: vi.fn() };
    const registry = new PanelRegistry(factory as never, contextKeys as never);

    await registry.openOrReveal('window-a', 'books');
    await registry.openOrReveal('window-a', 'game2048');

    expect(factory).toHaveBeenCalledTimes(1);
    expect(panel.open).toHaveBeenNthCalledWith(1, 'books');
    expect(panel.open).toHaveBeenNthCalledWith(2, 'game2048');
    expect(contextKeys.set).toHaveBeenCalledWith({
      isOpen: true,
      isVisible: true,
      isBossMode: false,
    });
  });

  it('clears state when the panel reports disposal', async () => {
    let stateChange:
      | ((state: { visible: boolean; open: boolean }) => void)
      | undefined;
    const panel = { open: vi.fn(), isVisible: true };
    const contextKeys = { set: vi.fn(), clear: vi.fn() };
    const registry = new PanelRegistry((_id, callback) => {
      stateChange = callback;
      return panel;
    }, contextKeys as never);
    await registry.openOrReveal('window-a', 'books');

    stateChange?.({ visible: false, open: false });
    expect(registry.get('window-a')).toBeUndefined();
    expect(contextKeys.clear).toHaveBeenCalledOnce();
  });
});
