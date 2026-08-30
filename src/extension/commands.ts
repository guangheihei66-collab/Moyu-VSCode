import * as vscode from 'vscode';
import type { AppSection } from '../shared/protocol/messages';
import type { PanelRegistry } from './panel/PanelRegistry';

export function registerCommands(
  context: vscode.ExtensionContext,
  registry: PanelRegistry,
  windowId: string,
): void {
  const open = (section: AppSection) =>
    registry.openOrReveal(windowId, section);
  context.subscriptions.push(
    vscode.commands.registerCommand('moyu.open', () => open('books')),
    vscode.commands.registerCommand('moyu.openBooks', () => open('books')),
    vscode.commands.registerCommand('moyu.open2048', () => open('game2048')),
    vscode.commands.registerCommand('moyu.openSettings', () =>
      open('settings'),
    ),
    vscode.commands.registerCommand('moyu.toggleBossMode', () => {
      const panel = registry.get(windowId);
      if (panel?.isVisible !== true) return undefined;
      return undefined;
    }),
  );
}
