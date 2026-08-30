import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { ReaderSettingsService } from '../../application/reader/ReaderSettingsService';
import {
  PROTOCOL_VERSION,
  type AppSection,
  type HostEvent,
} from '../../shared/protocol/messages';
import { validateHostEvent } from '../../shared/protocol/validate';
import { SettingsMessageDispatcher } from './SettingsMessageDispatcher';
import { createWebviewHtml } from './webviewHtml';

export class PanelController {
  private panel: vscode.WebviewPanel | undefined;
  private sessionId: string | undefined;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly settings: ReaderSettingsService,
    private readonly onStateChange?: (state: {
      visible: boolean;
      open: boolean;
    }) => void,
  ) {}
  open(section: AppSection): vscode.WebviewPanel {
    let created = false;
    if (this.panel === undefined) {
      created = true;
      this.sessionId = randomUUID();
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
        this.sessionId = undefined;
        this.onStateChange?.({ visible: false, open: false });
      });
      this.panel.onDidChangeViewState((event) =>
        this.onStateChange?.({
          visible: event.webviewPanel.visible,
          open: true,
        }),
      );
      const sessionId = this.sessionId;
      const dispatcher = new SettingsMessageDispatcher(
        sessionId,
        this.settings,
      );
      this.panel.webview.onDidReceiveMessage(async (message: unknown) => {
        const response = await dispatcher.dispatch(message);
        if (response !== undefined) {
          await this.panel?.webview.postMessage(response);
        }
      });
      this.panel.webview.html = createWebviewHtml(
        this.panel.webview,
        this.context.extensionUri,
        undefined,
        section,
        sessionId,
      );
    }
    this.panel.reveal(vscode.ViewColumn.One);
    this.onStateChange?.({ visible: true, open: true });
    if (!created && this.sessionId !== undefined) {
      const navigation: HostEvent = {
        protocol: PROTOCOL_VERSION,
        id: randomUUID(),
        sessionId: this.sessionId,
        type: 'app/navigate',
        payload: { section },
      };
      const validation = validateHostEvent(navigation);
      if (validation.ok) void this.panel.webview.postMessage(validation.value);
    }
    return this.panel;
  }
  get isVisible(): boolean {
    return this.panel?.visible === true;
  }
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.sessionId = undefined;
    this.onStateChange?.({ visible: false, open: false });
  }
}
