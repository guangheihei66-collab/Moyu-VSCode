import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { RefreshCoordinator } from '../../application/sessions/RefreshCoordinator';
import { WebviewSessionRegistry } from '../../application/sessions/WebviewSessionRegistry';
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
import {
  SettingsMessageDispatcher,
  type HostModuleServices,
} from './SettingsMessageDispatcher';
import { createWebviewHtml } from './webviewHtml';

export interface PanelLifecycleServices {
  readonly sessionRegistry?: WebviewSessionRegistry;
  readonly refreshCoordinator?: RefreshCoordinator;
}

function refreshTarget(
  section: AppSection,
): 'bookshelf' | 'reader' | 'game2048' | 'settings' {
  return section === 'books' || section === 'home' ? 'bookshelf' : section;
}

function isMutation(request: HostRequest): request is Extract<
  HostRequest,
  {
    type:
      | 'settings/update'
      | 'reader/saveProgress'
      | 'game2048/newGame'
      | 'game2048/move'
      | 'game2048/save';
  }
> {
  return (
    request.type === 'settings/update' ||
    request.type === 'reader/saveProgress' ||
    request.type === 'game2048/newGame' ||
    request.type === 'game2048/move' ||
    request.type === 'game2048/save'
  );
}

export class PanelController {
  private panel: vscode.WebviewPanel | undefined;
  private sessionId: string | undefined;
  private currentSection: AppSection = 'books';
  private bossMode = false;
  private bossTransitionPending = false;
  private unregisterSession: (() => void) | undefined;
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
    private readonly moduleServices: HostModuleServices = {},
    private readonly lifecycleServices: PanelLifecycleServices = {},
  ) {}
  open(section: AppSection): vscode.WebviewPanel {
    let created = false;
    const previousSection = this.currentSection;
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
    const navigationBlocked = this.bossMode || this.bossTransitionPending;
    if (!navigationBlocked) this.currentSection = section;
    this.panel.reveal(vscode.ViewColumn.One);
    this.onStateChange?.({ visible: true, open: true });
    if (created) {
      this.scheduleRefresh((coordinator) =>
        coordinator.onCreated(refreshTarget(section)),
      );
    } else {
      this.scheduleRefresh((coordinator) =>
        coordinator.onRevealed(refreshTarget(section)),
      );
    }
    if (!created && !navigationBlocked && this.sessionId !== undefined) {
      if (previousSection !== section) {
        this.scheduleRefresh((coordinator) =>
          coordinator.onNavigated(refreshTarget(section)),
        );
      }
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
    this.bossMode = false;
    this.bossTransitionPending = false;
    this.attachPanel(panel, section);
    this.scheduleRefresh((coordinator) =>
      coordinator.onCreated(refreshTarget(section)),
    );
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
      this.bossTransitionPending = true;
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
    this.bossMode = enabled;
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
    this.detachSession();
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
    this.bossTransitionPending = false;
    this.bossMode = request.payload.mode === 'BOSS_MODE';
    pending.resolve();
  }

  private rejectBossTransition(requestId: string, error: Error): void {
    const pending = this.pendingBossTransitions.get(requestId);
    if (pending === undefined) return;
    this.pendingBossTransitions.delete(requestId);
    this.bossTransitionPending = this.pendingBossTransitions.size > 0;
    pending.reject(error);
  }

  private rejectPendingBossTransitions(error: Error): void {
    for (const requestId of this.pendingBossTransitions.keys()) {
      this.rejectBossTransition(requestId, error);
    }
    this.bossTransitionPending = false;
  }

  private attachPanel(panel: vscode.WebviewPanel, section: AppSection): void {
    this.detachSession();
    this.currentSection = section;
    this.sessionId = randomUUID();
    this.bossMode = false;
    this.bossTransitionPending = false;
    panel.onDidDispose(() => {
      if (this.panel !== panel) return;
      this.rejectPendingBossTransitions(
        new Error('Moyu Panel was disposed during a Boss Mode transition.'),
      );
      this.detachSession();
      this.panel = undefined;
      this.sessionId = undefined;
      this.bossMode = false;
      this.bossTransitionPending = false;
      this.onStateChange?.({ visible: false, open: false });
    });
    panel.onDidChangeViewState((event) => {
      if (this.panel !== event.webviewPanel) return;
      if (!event.webviewPanel.visible) {
        this.rejectPendingBossTransitions(
          new Error('Moyu Panel was hidden during a Boss Mode transition.'),
        );
        this.bossMode = false;
      }
      this.onStateChange?.({
        visible: event.webviewPanel.visible,
        open: true,
        bossMode: event.webviewPanel.visible ? undefined : false,
      });
      if (event.webviewPanel.visible) {
        this.scheduleRefresh((coordinator) =>
          coordinator.onRevealed(refreshTarget(this.currentSection)),
        );
      }
    });
    const sessionId = this.sessionId;
    this.unregisterSession = this.lifecycleServices.sessionRegistry?.register(
      sessionId,
      (event) => panel.webview.postMessage(event),
    );
    const dispatcher = new SettingsMessageDispatcher(
      sessionId,
      this.settings,
      this.moduleServices,
    );
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const request = validateHostRequest(message, sessionId);
      if (request.ok && request.value.type === 'boss/ack') {
        this.acknowledgeBossTransition(request.value);
        return;
      }
      if (request.ok && isMutation(request.value)) {
        try {
          await this.lifecycleServices.refreshCoordinator?.beforeMutation(
            refreshTarget(
              request.value.type === 'settings/update'
                ? 'settings'
                : request.value.type.startsWith('game2048/')
                  ? 'game2048'
                  : 'reader',
            ),
          );
        } catch {
          // The transaction boundary remains authoritative if a refresh read
          // is unavailable; it will still perform its locked merge/check.
        }
      }
      const response = await dispatcher.dispatch(message);
      if (response !== undefined) {
        await panel.webview.postMessage(response);
        if (
          request.ok &&
          isMutation(request.value) &&
          response.type !== 'response/error'
        ) {
          this.broadcastNotice('Moyu data was updated.');
        }
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

  private broadcastNotice(message: string): void {
    if (
      this.lifecycleServices.sessionRegistry === undefined ||
      this.sessionId === undefined
    )
      return;
    const event: HostEvent = {
      protocol: PROTOCOL_VERSION,
      id: randomUUID(),
      sessionId: this.sessionId,
      type: 'app/notice',
      payload: { message },
    };
    const validation = validateHostEvent(event);
    if (validation.ok) this.lifecycleServices.sessionRegistry.broadcast(event);
  }

  private detachSession(): void {
    this.unregisterSession?.();
    this.unregisterSession = undefined;
  }

  private scheduleRefresh(
    operation: (coordinator: RefreshCoordinator) => Promise<unknown>,
  ): void {
    const coordinator = this.lifecycleServices.refreshCoordinator;
    if (coordinator === undefined) return;
    void operation(coordinator).catch(() => undefined);
  }
}
