import * as vscode from 'vscode';
import type { PanelRegistry } from './PanelRegistry';

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
    void this.extensionUri;
    this.registry.restore(this.windowId, panel, 'books');
  }
}
