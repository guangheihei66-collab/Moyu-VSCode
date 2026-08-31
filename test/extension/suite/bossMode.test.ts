import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const vscodeHarness = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    registerCommand: vi.fn(
      (id: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(id, handler);
        return { dispose: vi.fn() };
      },
    ),
  };
});

vi.mock('vscode', () => ({
  commands: { registerCommand: vscodeHarness.registerCommand },
  window: {},
}));

import { BossModeService } from '../../../src/application/boss/BossModeService';
import { registerCommands } from '../../../src/extension/commands';

function context() {
  return { subscriptions: [] as unknown[] };
}

function panel(visible = true) {
  let title = 'Moyu';
  return {
    isVisible: visible,
    get title() {
      return title;
    },
    captureSnapshot: vi.fn(() => ({
      route: 'reader',
      moduleId: 'reader:book-1',
      panelTitle: title,
    })),
    requestBossTransition: vi.fn(async () => undefined),
    setPanelTitle: vi.fn((next: string) => {
      title = next;
    }),
    setBossContext: vi.fn(),
  };
}

describe('boss mode extension integration', () => {
  it('uses the validated setting and gates title/context changes on Webview acknowledgement', async () => {
    let acknowledge!: () => void;
    const livePanel = panel();
    livePanel.requestBossTransition.mockImplementation(
      () => new Promise<void>((resolve) => (acknowledge = resolve)),
    );
    const registry = { get: vi.fn(() => livePanel) };
    const boss = new BossModeService({ acknowledgementTimeoutMs: 100 });
    const settings = {
      read: vi.fn(async () => ({
        version: 2,
        settings: {
          fontSize: 16,
          lineHeight: 1.75,
          contentWidth: 720,
          bossTemplate: 'json' as const,
        },
      })),
    };
    registerCommands(context() as never, registry as never, 'window-1', {
      boss: { service: boss, settings: settings as never },
    } as never);

    const operation = vscodeHarness.handlers.get('moyu.toggleBossMode')?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(livePanel.setPanelTitle).not.toHaveBeenCalled();
    expect(livePanel.setBossContext).not.toHaveBeenCalled();

    acknowledge();
    await operation;
    expect(livePanel.requestBossTransition).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'BOSS_MODE' }),
      'json',
    );
    expect(livePanel.setPanelTitle).toHaveBeenCalledWith('settings.json');
    expect(livePanel.setBossContext).toHaveBeenCalledWith(true);

    livePanel.requestBossTransition.mockResolvedValue(undefined);
    await vscodeHarness.handlers.get('moyu.toggleBossMode')?.();
    expect(livePanel.setPanelTitle).toHaveBeenLastCalledWith('Moyu');
    expect(livePanel.setBossContext).toHaveBeenLastCalledWith(false);
  });

  it('does not read settings or open Moyu for absent and hidden panels', async () => {
    const settings = { read: vi.fn() };
    const registry = { get: vi.fn(() => undefined) };
    registerCommands(context() as never, registry as never, 'window-2', {
      boss: {
        service: new BossModeService(),
        settings: settings as never,
      },
    } as never);
    await vscodeHarness.handlers.get('moyu.toggleBossMode')?.();
    registry.get.mockReturnValue(panel(false));
    await vscodeHarness.handlers.get('moyu.toggleBossMode')?.();

    expect(settings.read).not.toHaveBeenCalled();
    expect(registry.get).toHaveBeenCalledTimes(2);
  });

  it('contributes the exact Windows keybinding without a DOM-global shortcut', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      contributes: {
        keybindings: { command: string; key: string; when: string }[];
      };
    };
    expect(manifest.contributes.keybindings).toContainEqual({
      command: 'moyu.toggleBossMode',
      key: 'ctrl+m',
      when: 'moyu.isOpen && moyu.isVisible',
    });
  });
});
