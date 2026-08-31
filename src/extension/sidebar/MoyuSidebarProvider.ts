import * as vscode from 'vscode';
import type { AppSection } from '../../shared/protocol/messages';
import type { PanelRegistry } from '../panel/PanelRegistry';

const sections: readonly AppSection[] = ['books', 'game2048', 'settings'];

export class MoyuSidebarProvider implements vscode.WebviewViewProvider {
  private resolved = false;

  constructor(
    private readonly registry: PanelRegistry,
    private readonly windowId: string,
  ) {}

  get isResolved(): boolean {
    return this.resolved;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.resolved = true;
    view.webview.options = { enableScripts: true };
    view.webview.html = `<!doctype html><html><body><nav aria-label="Moyu navigation"><button data-section="books">Home / Books</button><button data-section="game2048">2048</button><button data-section="settings">Settings</button></nav><script>const vscode=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({section:button.dataset.section})));</script></body></html>`;
    view.webview.onDidReceiveMessage((message) => {
      if (
        typeof message?.section === 'string' &&
        (sections as readonly string[]).includes(message.section)
      )
        void this.registry.openOrReveal(
          this.windowId,
          message.section as AppSection,
        );
    });
  }
}
