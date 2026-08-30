import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { AppSection } from '../../shared/protocol/messages';

export function createWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce = crypto.randomBytes(16).toString('hex'),
  initialSection: AppSection = 'books',
  sessionId: string = crypto.randomUUID(),
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.css'),
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Moyu</title>
  </head>
  <body><main id="app" tabindex="-1" aria-live="polite" data-initial-section="${initialSection}" data-session-id="${sessionId}"></main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
