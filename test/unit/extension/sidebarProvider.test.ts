import { describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  let receiveMessage:
    | ((message: unknown) => unknown | Promise<unknown>)
    | undefined;
  let disposeView: (() => void) | undefined;
  const receiveDisposable = { dispose: vi.fn() };
  const viewDisposable = { dispose: vi.fn() };
  const webview = {
    cspSource: 'vscode-webview://test',
    html: '',
    options: {},
    asWebviewUri: (uri: { toString(): string }) => uri,
    onDidReceiveMessage: vi.fn(
      (listener: (message: unknown) => unknown | Promise<unknown>) => {
        receiveMessage = listener;
        return receiveDisposable;
      },
    ),
    postMessage: vi.fn().mockResolvedValue(true),
  };
  const view = {
    webview,
    onDidDispose: vi.fn((listener: () => void) => {
      disposeView = listener;
      return viewDisposable;
    }),
  };
  return {
    view,
    webview,
    receive: async (message: unknown) => receiveMessage?.(message),
    dispose: () => disposeView?.(),
    receiveDisposable,
    viewDisposable,
  };
});

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      path: [base.path, ...parts].join('/'),
      toString() {
        return this.path;
      },
    }),
  },
}));

import { MoyuSidebarProvider } from '../../../src/extension/sidebar/MoyuSidebarProvider';

describe('MoyuSidebarProvider', () => {
  it('uses packaged CSP assets, validates navigation, and disposes its view listeners', async () => {
    const registry = { openOrReveal: vi.fn().mockResolvedValue(undefined) };
    const provider = new MoyuSidebarProvider(registry as never, 'window-a', {
      path: 'extension',
    } as never);

    provider.resolveWebviewView(harness.view as never);

    expect(provider.isResolved).toBe(true);
    expect(harness.webview.options).toEqual(
      expect.objectContaining({ enableScripts: true }),
    );
    expect(harness.webview.html).toContain("default-src 'none'");
    expect(harness.webview.html).toMatch(/nonce-[a-f0-9]+/);
    expect(harness.webview.html).toContain('extension/dist/webview/sidebar.js');
    expect(harness.webview.html).toContain(
      'extension/dist/webview/sidebar.css',
    );

    await harness.receive({ type: 'navigate', section: 'settings' });
    expect(registry.openOrReveal).toHaveBeenCalledWith('window-a', 'settings');
    await harness.receive({ type: 'navigate', section: 'reader' });
    expect(registry.openOrReveal).toHaveBeenCalledTimes(1);

    provider.setSummary({ booksCount: 4 });
    provider.setActiveSection('books');
    expect(harness.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'state',
      model: { active: 'books', booksCount: 4 },
    });

    harness.dispose();
    expect(provider.isResolved).toBe(false);
    expect(harness.receiveDisposable.dispose).toHaveBeenCalledOnce();
    expect(harness.viewDisposable.dispose).toHaveBeenCalledOnce();
    provider.dispose();
  });
});
