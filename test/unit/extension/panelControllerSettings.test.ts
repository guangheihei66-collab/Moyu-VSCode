import { describe, expect, it, vi } from 'vitest';

const vscodeHarness = vi.hoisted(() => {
  let receiveMessage: ((message: unknown) => unknown) | undefined;
  const postMessage = vi.fn().mockResolvedValue(true);
  const panel = {
    visible: true,
    title: 'Moyu',
    webview: {
      cspSource: 'vscode-webview://test',
      html: '',
      asWebviewUri: (uri: { toString(): string }) => uri,
      onDidReceiveMessage: (listener: (message: unknown) => unknown) => {
        receiveMessage = listener;
      },
      postMessage,
    },
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn(),
    onDidChangeViewState: vi.fn(),
  };
  return {
    panel,
    postMessage,
    createWebviewPanel: vi.fn(() => panel),
    receive: async (message: unknown) => {
      await receiveMessage?.(message);
    },
  };
});

vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      path: [base.path, ...parts].join('/'),
      toString() {
        return this.path;
      },
    }),
  },
  window: { createWebviewPanel: vscodeHarness.createWebviewPanel },
}));

import { ReaderSettingsService } from '../../../src/application/reader/ReaderSettingsService';
import { PanelController } from '../../../src/extension/panel/PanelController';
import { PreferencesRepository } from '../../../src/infrastructure/storage/preferencesRepository';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

describe('PanelController settings wiring', () => {
  it('embeds the initial route, dispatches settings, and navigates an existing panel', async () => {
    await withStorageDirectory(async (root) => {
      const controller = new PanelController(
        {
          extensionUri: { path: 'extension' },
        } as never,
        new ReaderSettingsService(new PreferencesRepository(root)),
      );

      controller.open('settings');
      const html = vscodeHarness.panel.webview.html;
      expect(html).toContain('data-initial-section="settings"');
      const sessionId = /data-session-id="([^"]+)"/.exec(html)?.[1];
      expect(sessionId).toBeTruthy();

      await vscodeHarness.receive({
        protocol: 1,
        id: 'settings-read-1',
        sessionId,
        type: 'settings/read',
        payload: {},
      });
      expect(vscodeHarness.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          type: 'settings/snapshot',
          payload: expect.objectContaining({ requestId: 'settings-read-1' }),
        }),
      );

      await vscodeHarness.receive({
        protocol: 1,
        id: 'settings-update-1',
        sessionId,
        type: 'settings/update',
        payload: { baseVersion: 0, patch: { fontSize: 20 } },
      });
      expect(vscodeHarness.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sessionId,
          type: 'settings/snapshot',
          payload: expect.objectContaining({
            requestId: 'settings-update-1',
            snapshot: expect.objectContaining({
              settings: expect.objectContaining({ fontSize: 20 }),
            }),
          }),
        }),
      );

      controller.open('game2048');
      expect(vscodeHarness.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sessionId,
          type: 'app/navigate',
          payload: { section: 'game2048' },
        }),
      );
    });
  });

  it('correlates a Boss transition acknowledgement before changing panel state', async () => {
    const states: { visible: boolean; open: boolean; bossMode?: boolean }[] =
      [];
    const controller = new PanelController(
      { extensionUri: { path: 'extension' } } as never,
      { read: vi.fn(), update: vi.fn() } as never,
      (state) => states.push(state),
    );
    vscodeHarness.panel.title = 'Moyu';
    controller.open('reader');

    expect(controller.captureSnapshot()).toMatchObject({
      route: 'reader',
      moduleId: 'reader',
      panelTitle: 'Moyu',
    });
    const transition = controller.requestBossTransition(
      {
        from: 'NORMAL',
        mode: 'BOSS_MODE',
        snapshot: controller.captureSnapshot(),
      },
      'buildLog',
    );
    const event = vscodeHarness.postMessage.mock.calls.at(-1)?.[0] as {
      payload: { requestId: string };
    };
    expect(event).toMatchObject({
      type: 'boss/modeChanged',
      payload: { mode: 'BOSS_MODE', template: 'buildLog' },
    });

    let settled = false;
    void transition.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vscodeHarness.receive({
      protocol: 1,
      id: 'boss-ack-1',
      sessionId: eventSessionId(event),
      type: 'boss/ack',
      payload: {
        requestId: event.payload.requestId,
        mode: 'BOSS_MODE',
      },
    });
    await transition;

    controller.setPanelTitle('build.log');
    controller.setBossContext(true);
    expect(vscodeHarness.panel.title).toBe('build.log');
    expect(states.at(-1)).toMatchObject({ bossMode: true, open: true });
  });

  it('routes reader module requests through the single panel dispatcher', async () => {
    const reader = {
      open: vi.fn(async () => ({
        version: 4,
        locator: {
          kind: 'txt' as const,
          blockId: 'block-7',
          characterOffset: 9,
          contentFingerprint: 'block-fingerprint-7',
        },
      })),
    };
    const controller = new PanelController(
      { extensionUri: { path: 'extension' } } as never,
      { read: vi.fn(), update: vi.fn() } as never,
      undefined,
      { reader } as never,
    );
    controller.open('reader');
    const sessionId = /data-session-id="([^"]+)"/.exec(
      vscodeHarness.panel.webview.html,
    )?.[1];

    await vscodeHarness.receive({
      protocol: 1,
      id: 'reader-open-1',
      sessionId,
      type: 'reader/open',
      payload: { bookId: 'reader-book' },
    });

    expect(reader.open).toHaveBeenCalledWith('reader-book');
    expect(vscodeHarness.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'reader/opened',
        payload: expect.objectContaining({
          requestId: 'reader-open-1',
          snapshot: expect.objectContaining({
            anchor: expect.objectContaining({ characterOffset: 9 }),
          }),
        }),
      }),
    );
  });

  it('attaches a restored panel in NORMAL without revealing or replacing it', () => {
    const states: { visible: boolean; open: boolean; bossMode?: boolean }[] =
      [];
    const controller = new PanelController(
      { extensionUri: { path: 'extension' } } as never,
      { read: vi.fn(), update: vi.fn() } as never,
      (state) => states.push(state),
    );
    vscodeHarness.panel.title = 'build.log';
    vscodeHarness.panel.reveal.mockClear();

    controller.restore(vscodeHarness.panel as never, 'books');

    expect(vscodeHarness.panel.title).toBe('Moyu');
    expect(vscodeHarness.panel.reveal).not.toHaveBeenCalled();
    expect(vscodeHarness.panel.webview.html).toContain(
      'data-initial-section="books"',
    );
    expect(states.at(-1)).toEqual({
      visible: true,
      open: true,
      bossMode: false,
    });
  });
});

function eventSessionId(event: unknown): string {
  return (event as { sessionId: string }).sessionId;
}
