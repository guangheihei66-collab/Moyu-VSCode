import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { ReaderSettingsService } from '../../application/reader/ReaderSettingsService';
import type {
  BossSnapshot,
  BossTemplate,
  BossTransition,
} from '../../domain/boss/types';
import {
  PROTOCOL_VERSION,
  type AppSection,
  type HostEvent,
  type HostRequest,
} from '../../shared/protocol/messages';
import {
  validateHostEvent,
  validateHostRequest,
} from '../../shared/protocol/validate';
import { SettingsMessageDispatcher } from './SettingsMessageDispatcher';
import { createWebviewHtml } from './webviewHtml';

export class PanelController {
  private panel: vscode.WebviewPanel | undefined;
  private sessionId: string | undefined;
  private currentSection: AppSection = 'books';
  private readonly pendingBossTransitions = new Map<
    string,
    {
      mode: BossTransition['mode'];
      resolve: () => void;
      reject: (error: Error) => void;
    }
  >();
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly settings: ReaderSettingsService,
    private readonly onStateChange?: (state: {
      visible: boolean;
      open: boolean;
      bossMode?: boolean;
    }) => void,
  ) {}
  open(section: AppSection): vscode.WebviewPanel {
    this.currentSection = section;
    let created = false;
    if (this.panel === undefined) {
      created = true;
      this.panel = vscode.window.createWebviewPanel(
        'moyu.main',
        'Moyu',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
          ],
        },
      );
      this.attachPanel(this.panel, section);
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
  restore(panel: vscode.WebviewPanel, section: AppSection): void {
    this.rejectPendingBossTransitions(
      new Error('Moyu Panel was restored during a Boss Mode transition.'),
    );
    this.panel = panel;
    this.panel.title = 'Moyu';
    this.attachPanel(panel, section);
    this.onStateChange?.({
      visible: panel.visible,
      open: true,
      bossMode: false,
    });
  }
  get isVisible(): boolean {
    return this.panel?.visible === true;
  }
  captureSnapshot(): BossSnapshot {
    if (this.panel === undefined) {
      throw new Error('Cannot capture a closed Moyu Panel.');
    }
    return {
      route: this.currentSection,
      moduleId: this.currentSection,
      panelTitle: this.panel.title,
    };
  }
  requestBossTransition(
    transition: BossTransition,
    template: BossTemplate,
  ): Promise<void> {
    if (this.panel === undefined || this.sessionId === undefined) {
      return Promise.reject(
        new Error('Cannot transition a closed Moyu Panel.'),
      );
    }
    const requestId = randomUUID();
    const event: HostEvent = {
      protocol: PROTOCOL_VERSION,
      id: randomUUID(),
      sessionId: this.sessionId,
      type: 'boss/modeChanged',
      payload: { requestId, mode: transition.mode, template },
    };
    const validation = validateHostEvent(event);
    if (!validation.ok) {
      return Promise.reject(new Error('The Boss Mode event is invalid.'));
    }
    return new Promise<void>((resolve, reject) => {
      this.pendingBossTransitions.set(requestId, {
        mode: transition.mode,
        resolve,
        reject,
      });
      void Promise.resolve(this.panel!.webview.postMessage(validation.value))
        .then((accepted) => {
          if (!accepted) {
            this.rejectBossTransition(
              requestId,
              new Error('The Webview did not accept the Boss Mode event.'),
            );
          }
        })
        .catch(() => {
          this.rejectBossTransition(
            requestId,
            new Error('The Boss Mode event could not be delivered.'),
          );
        });
    });
  }
  setPanelTitle(title: string): void {
    if (this.panel !== undefined) this.panel.title = title;
  }
  setBossContext(enabled: boolean): void {
    this.onStateChange?.({
      visible: this.isVisible,
      open: this.panel !== undefined,
      bossMode: enabled,
    });
  }
  dispose(): void {
    this.rejectPendingBossTransitions(
      new Error('Moyu Panel was disposed during a Boss Mode transition.'),
    );
    this.panel?.dispose();
    this.panel = undefined;
    this.sessionId = undefined;
    this.onStateChange?.({ visible: false, open: false });
  }

  private acknowledgeBossTransition(
    request: Extract<HostRequest, { type: 'boss/ack' }>,
  ): void {
    const pending = this.pendingBossTransitions.get(request.payload.requestId);
    if (pending === undefined || pending.mode !== request.payload.mode) return;
    this.pendingBossTransitions.delete(request.payload.requestId);
    pending.resolve();
  }

  private rejectBossTransition(requestId: string, error: Error): void {
    const pending = this.pendingBossTransitions.get(requestId);
    if (pending === undefined) return;
    this.pendingBossTransitions.delete(requestId);
    pending.reject(error);
  }

  private rejectPendingBossTransitions(error: Error): void {
    for (const requestId of this.pendingBossTransitions.keys()) {
      this.rejectBossTransition(requestId, error);
    }
  }

  private attachPanel(panel: vscode.WebviewPanel, section: AppSection): void {
    this.currentSection = section;
    this.sessionId = randomUUID();
    panel.onDidDispose(() => {
      this.rejectPendingBossTransitions(
        new Error('Moyu Panel was disposed during a Boss Mode transition.'),
      );
      this.panel = undefined;
      this.sessionId = undefined;
      this.onStateChange?.({ visible: false, open: false });
    });
    panel.onDidChangeViewState((event) =>
      this.onStateChange?.({
        visible: event.webviewPanel.visible,
        open: true,
      }),
    );
    const sessionId = this.sessionId;
    const dispatcher = new SettingsMessageDispatcher(sessionId, this.settings);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const request = validateHostRequest(message, sessionId);
      if (request.ok && request.value.type === 'boss/ack') {
        this.acknowledgeBossTransition(request.value);
        return;
      }
      const response = await dispatcher.dispatch(message);
      if (response !== undefined) {
        await this.panel?.webview.postMessage(response);
      }
    });
    panel.webview.html = createWebviewHtml(
      panel.webview,
      this.context.extensionUri,
      undefined,
      section,
      sessionId,
    );
  }
}
