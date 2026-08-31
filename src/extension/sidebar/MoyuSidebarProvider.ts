import * as vscode from 'vscode';
import { isSidebarMessage } from '../../shared/protocol/validate';
import type {
  SidebarHostMessage,
  SidebarSection,
  SidebarViewModel,
} from '../../shared/protocol/messages';
import type { PanelRegistry } from '../panel/PanelRegistry';
import { createSidebarHtml } from './sidebarHtml';

function boundedCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export class MoyuSidebarProvider implements vscode.WebviewViewProvider {
  private readonly disposables: vscode.Disposable[] = [];
  private view: vscode.WebviewView | undefined;
  private resolved = false;
  private model: SidebarViewModel = {
    active: 'home',
    booksCount: 0,
    bestScore: 0,
  };

  constructor(
    private readonly registry: PanelRegistry,
    private readonly windowId: string,
    private readonly extensionUri: vscode.Uri,
  ) {}

  get isResolved(): boolean {
    return this.resolved;
  }

  get viewModel(): SidebarViewModel {
    return { ...this.model };
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.clearResolvedView();
    this.view = view;
    this.resolved = true;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };
    view.webview.html = createSidebarHtml(view.webview, this.extensionUri);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => {
        if (!isSidebarMessage(message)) return;
        this.setActiveSection(message.section);
        void this.registry.openOrReveal(this.windowId, message.section);
      }),
      view.onDidDispose(() => this.clearResolvedView()),
    );
    this.postState();
  }

  setActiveSection(section: SidebarSection): void {
    this.model = { ...this.model, active: section };
    this.postState();
  }

  setSummary(
    summary: Pick<SidebarViewModel, 'booksCount' | 'bestScore'>,
  ): void {
    this.model = {
      ...this.model,
      booksCount: boundedCount(summary.booksCount),
      bestScore: boundedCount(summary.bestScore),
    };
    this.postState();
  }

  dispose(): void {
    this.clearResolvedView();
  }

  private postState(): void {
    if (this.view === undefined) return;
    const message: SidebarHostMessage = {
      type: 'state',
      model: this.model,
    };
    void this.view.webview.postMessage(message);
  }

  private clearResolvedView(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    this.view = undefined;
    this.resolved = false;
  }
}
