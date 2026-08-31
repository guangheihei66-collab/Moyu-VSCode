import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

export function createSidebarHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce = crypto.randomBytes(16).toString('hex'),
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'sidebar.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'sidebar.css'),
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'; img-src ${webview.cspSource}; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Moyu navigation</title>
  </head>
  <body><main id="sidebar-app"></main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
