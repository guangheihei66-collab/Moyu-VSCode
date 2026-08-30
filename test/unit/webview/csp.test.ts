import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      toString: () => [base.path, ...parts].join('/'),
    }),
  },
}));
import { createWebviewHtml } from '../../../src/extension/panel/webviewHtml';

describe('Webview CSP', () => {
  it('uses a deny-by-default policy and packaged resource URIs', () => {
    const webview = {
      cspSource: 'vscode-webview://test',
      asWebviewUri: (uri: { toString(): string }) => uri,
    } as never;
    const extensionUri = {
      toString: () => 'extension',
      path: 'extension',
    } as never;
    const html = createWebviewHtml(webview, extensionUri, 'fixednonce');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(
      /img-src|font-src|https:|unsafe-inline|unsafe-eval/,
    );
    expect(html).toContain('nonce-fixednonce');
  });
});
