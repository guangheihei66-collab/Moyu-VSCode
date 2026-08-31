import { describe, expect, it, vi } from 'vitest';

const vscodeHarness = vi.hoisted(() => {
  let receiveMessage: ((message: unknown) => unknown) | undefined;
  let disposeListener: (() => void) | undefined;
  let viewStateListener:
    | ((event: { webviewPanel: typeof panel }) => void)
    | undefined;
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
        return { dispose: vi.fn() };
      },
      postMessage,
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: (listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    },
    onDidChangeViewState: (
      listener: (event: { webviewPanel: typeof panel }) => void,
    ) => {
      viewStateListener = listener;
      return { dispose: vi.fn() };
    },
  };
  return {
    panel,
    postMessage,
    createWebviewPanel: vi.fn(() => panel),
    receive: async (message: unknown) => {
      await receiveMessage?.(message);
    },
    reveal: () => viewStateListener?.({ webviewPanel: panel }),
    dispose: () => disposeListener?.(),
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
import { WebviewSessionRegistry } from '../../../src/application/sessions/WebviewSessionRegistry';
import { PanelController } from '../../../src/extension/panel/PanelController';

describe('PanelController recovery lifecycle', () => {
  it('refreshes at lifecycle boundaries and unregisters a disposed session', async () => {
    const refresh = {
      onCreated: vi.fn(async () => undefined),
      onRevealed: vi.fn(async () => undefined),
      onNavigated: vi.fn(async () => undefined),
      beforeMutation: vi.fn(async () => undefined),
    };
    const registry = new WebviewSessionRegistry();
    const controller = new PanelController(
      { extensionUri: { path: 'extension' } } as never,
      { read: vi.fn(), update: vi.fn() } as never,
      undefined,
      {},
      { sessionRegistry: registry, refreshCoordinator: refresh as never },
    );

    controller.open('books');
    await Promise.resolve();
    expect(refresh.onCreated).toHaveBeenCalledWith('bookshelf');
    expect(registry.size).toBe(1);

    controller.open('settings');
    await Promise.resolve();
    expect(refresh.onRevealed).toHaveBeenCalledWith('settings');
    expect(refresh.onNavigated).toHaveBeenCalledWith('settings');

    vscodeHarness.reveal();
    await Promise.resolve();
    expect(refresh.onRevealed).toHaveBeenCalledTimes(2);

    vscodeHarness.dispose();
    expect(registry.size).toBe(0);
  });

  it('refreshes before a successful mutation and broadcasts a local notice', async () => {
    const refresh = {
      onCreated: vi.fn(async () => undefined),
      onRevealed: vi.fn(async () => undefined),
      onNavigated: vi.fn(async () => undefined),
      beforeMutation: vi.fn(async () => undefined),
    };
    const registry = new WebviewSessionRegistry();
    const settings = new ReaderSettingsService({
      read: vi.fn(async () => undefined),
      update: vi.fn(
        async (baseVersion: number, patch: { fontSize?: number }) => ({
          schemaVersion: 1,
          version: baseVersion + 1,
          generation: baseVersion + 1,
          updatedAt: 1,
          data: {
            settings: {
              fontSize: patch.fontSize ?? 18,
              lineHeight: 1.75,
              contentWidth: 760,
              bossTemplate: 'typescript' as const,
            },
            fieldVersions: {
              fontSize: baseVersion + 1,
              lineHeight: baseVersion,
              contentWidth: baseVersion,
              bossTemplate: baseVersion,
            },
          },
        }),
      ),
    });
    const controller = new PanelController(
      { extensionUri: { path: 'extension' } } as never,
      settings,
      undefined,
      {},
      { sessionRegistry: registry, refreshCoordinator: refresh as never },
    );

    controller.open('settings');
    const sessionId = /data-session-id="([^"]+)"/.exec(
      vscodeHarness.panel.webview.html,
    )?.[1];
    await vscodeHarness.receive({
      protocol: 1,
      id: 'settings-update-1',
      sessionId,
      type: 'settings/update',
      payload: { baseVersion: 0, patch: { fontSize: 20 } },
    });

    expect(refresh.beforeMutation).toHaveBeenCalledWith('settings');
    expect(
      vscodeHarness.postMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === 'app/notice',
      ),
    ).toBe(true);
  });

  it('uses the bookshelf refresh boundary for a Host bookshelf mutation', async () => {
    const refresh = {
      onCreated: vi.fn(async () => undefined),
      onRevealed: vi.fn(async () => undefined),
      onNavigated: vi.fn(async () => undefined),
      beforeMutation: vi.fn(async () => undefined),
    };
    const books = {
      import: vi.fn(async () => undefined),
      relocate: vi.fn(async () => undefined),
      selectEncoding: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const controller = new PanelController(
      { extensionUri: { path: 'extension' } } as never,
      { read: vi.fn(), update: vi.fn() } as never,
      undefined,
      {
        books,
        presentation: {
          readBooks: async () => ({ version: 1, books: [] }),
          readHome: async () => ({
            recentBooks: [],
            booksCount: 0,
            bestScore: 0,
            hasGameSession: false,
          }),
        },
      },
      { refreshCoordinator: refresh as never },
    );

    controller.open('books');
    const sessionId = /data-session-id="([^"]+)"/.exec(
      vscodeHarness.panel.webview.html,
    )?.[1];
    await vscodeHarness.receive({
      protocol: 1,
      id: 'books-import-1',
      sessionId,
      type: 'books/import',
      payload: {},
    });

    expect(refresh.beforeMutation).toHaveBeenCalledWith('bookshelf');
    expect(books.import).toHaveBeenCalledWith(undefined);
    expect(
      vscodeHarness.postMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === 'books/snapshot',
      ),
    ).toBe(true);
  });
});
