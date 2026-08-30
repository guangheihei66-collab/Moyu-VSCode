import * as vscode from 'vscode';
import type { AppSection } from '../../shared/protocol/messages';
import { createWebviewHtml } from './webviewHtml';

export class PanelController {
  private panel: vscode.WebviewPanel | undefined;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onStateChange?: (state: {
      visible: boolean;
      open: boolean;
    }) => void,
  ) {}
  open(section: AppSection): vscode.WebviewPanel {
    if (this.panel === undefined) {
      this.panel = vscode.window.createWebviewPanel(
        'moyu',
        'Moyu',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
          ],
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.onStateChange?.({ visible: false, open: false });
      });
      this.panel.onDidChangeViewState((event) =>
        this.onStateChange?.({
          visible: event.webviewPanel.visible,
          open: true,
        }),
      );
      this.panel.webview.html = createWebviewHtml(
        this.panel.webview,
        this.context.extensionUri,
      );
    }
    this.panel.reveal(vscode.ViewColumn.One);
    this.onStateChange?.({ visible: true, open: true });
    void section;
    return this.panel;
  }
  get isVisible(): boolean {
    return this.panel?.visible === true;
  }
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.onStateChange?.({ visible: false, open: false });
  }
}
