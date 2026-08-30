import * as vscode from 'vscode';
import type { PanelRegistry } from './PanelRegistry';
import { createWebviewHtml } from './webviewHtml';

export class PanelSerializer implements vscode.WebviewPanelSerializer {
  constructor(
    private readonly registry: PanelRegistry,
    private readonly windowId: string,
    private readonly extensionUri?: vscode.Uri,
  ) {}
  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: unknown,
  ): Promise<void> {
    void state;
    await this.registry.openOrReveal(this.windowId, 'books');
    if (this.extensionUri !== undefined) {
      panel.webview.html = createWebviewHtml(panel.webview, this.extensionUri);
    }
  }
}
