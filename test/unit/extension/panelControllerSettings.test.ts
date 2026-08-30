import { describe, expect, it, vi } from 'vitest';

const vscodeHarness = vi.hoisted(() => {
  let receiveMessage: ((message: unknown) => unknown) | undefined;
  const postMessage = vi.fn().mockResolvedValue(true);
  const panel = {
    visible: true,
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
});
