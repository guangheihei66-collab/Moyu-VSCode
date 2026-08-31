import { describe, expect, it, vi } from 'vitest';
import { BossModeService } from '../../../src/application/boss/BossModeService';
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

  it('resets the window-local Boss state when its panel is disposed', async () => {
    let stateChange:
      | ((state: { visible: boolean; open: boolean }) => void)
      | undefined;
    const resetBossMode = vi.fn();
    const registry = new PanelRegistry(
      (_id, callback) => {
        stateChange = callback;
        return { open: vi.fn(), isVisible: true } as never;
      },
      { set: vi.fn(), clear: vi.fn() } as never,
      resetBossMode,
    );
    await registry.openOrReveal('window-a', 'reader');

    stateChange?.({ visible: false, open: false });

    expect(resetBossMode).toHaveBeenCalledOnce();
  });

  it('resets the window-local Boss state when a live panel becomes hidden', async () => {
    let stateChange:
      | ((state: { visible: boolean; open: boolean }) => void)
      | undefined;
    const resetBossMode = vi.fn();
    const registry = new PanelRegistry(
      (_id, callback) => {
        stateChange = callback;
        return { open: vi.fn(), isVisible: true } as never;
      },
      { set: vi.fn(), clear: vi.fn() } as never,
      resetBossMode,
    );
    await registry.openOrReveal('window-a', 'reader');

    stateChange?.({ visible: false, open: true });

    expect(resetBossMode).toHaveBeenCalledOnce();
  });

  it('keeps a restored panel NORMAL after enter, hide, and reshow', async () => {
    let stateChange:
      | ((state: { visible: boolean; open: boolean }) => void)
      | undefined;
    const boss = new BossModeService();
    const registry = new PanelRegistry(
      (_id, callback) => {
        stateChange = callback;
        return { restore: vi.fn(), open: vi.fn(), isVisible: true } as never;
      },
      { set: vi.fn(), clear: vi.fn() } as never,
      () => boss.reset(),
    );
    registry.restore('window-a', {} as never);
    await boss.toggle({
      isVisible: true,
      captureSnapshot: () => ({ route: 'reader', moduleId: 'reader:book-1' }),
      requestBossTransition: async () => undefined,
    });

    stateChange?.({ visible: false, open: true });
    stateChange?.({ visible: true, open: true });

    expect(boss.mode).toBe('NORMAL');
  });

  it('cancels a pending exit before serializer restore can stale-rollback it', async () => {
    let stateChange:
      | ((state: { visible: boolean; open: boolean }) => void)
      | undefined;
    let acknowledgeExit!: () => void;
    const boss = new BossModeService({ acknowledgementTimeoutMs: 60_000 });
    const panelSession = {
      isVisible: true,
      captureSnapshot: () => ({ route: 'reader', moduleId: 'reader:book-1' }),
      requestBossTransition: vi.fn(async () => undefined),
      setPanelTitle: vi.fn(),
      setBossContext: vi.fn(),
    };
    const registry = new PanelRegistry(
      (_id, callback) => {
        stateChange = callback;
        return { restore: vi.fn(), open: vi.fn(), isVisible: true } as never;
      },
      { set: vi.fn(), clear: vi.fn() } as never,
      () => boss.reset(),
    );
    await registry.openOrReveal('window-a', 'reader');
    await boss.toggle(panelSession);
    panelSession.setPanelTitle.mockClear();
    panelSession.setBossContext.mockClear();
    panelSession.requestBossTransition.mockImplementation(
      () => new Promise<void>((resolve) => (acknowledgeExit = resolve)),
    );
    const exit = boss.toggle(panelSession);
    await Promise.resolve();

    registry.restore('window-a', {} as never);
    expect(boss.mode).toBe('NORMAL');
    acknowledgeExit();
    await expect(exit).rejects.toThrow('Boss Mode transition cancelled');
    stateChange?.({ visible: true, open: true });
    expect(panelSession.setPanelTitle).not.toHaveBeenCalled();
    expect(panelSession.setBossContext).not.toHaveBeenCalled();
  });
});
