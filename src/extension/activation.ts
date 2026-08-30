import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ContextKeys } from './contextKeys';
import { MoyuSidebarProvider } from './sidebar/MoyuSidebarProvider';
import { PanelController } from './panel/PanelController';
import { PanelRegistry } from './panel/PanelRegistry';
import { PanelSerializer } from './panel/PanelSerializer';

export function activate(context: vscode.ExtensionContext): void {
  const windowId = String(vscode.env.sessionId);
  const contextKeys = new ContextKeys();
  const registry = new PanelRegistry(
    (_, onStateChange) => new PanelController(context, onStateChange),
    contextKeys,
  );
  registerCommands(context, registry, windowId);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'moyu.sidebar',
      new MoyuSidebarProvider(registry, windowId),
    ),
    vscode.window.registerWebviewPanelSerializer(
      'moyu.main',
      new PanelSerializer(registry, windowId, context.extensionUri),
    ),
  );
}

export function deactivate(): void {}
