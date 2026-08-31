import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { pickBookUri } from '../../../src/extension/commands';
import { ContextKeys } from '../../../src/extension/contextKeys';
import { PanelSerializer } from '../../../src/extension/panel/PanelSerializer';

interface PanelHandle {
  isVisible?: boolean;
  open?: (
    section: 'home' | 'books' | 'reader' | 'game2048' | 'settings',
  ) => unknown;
  dispose?: () => void;
  captureSnapshot?: () => { route: string; panelTitle: string };
  panel?: { webview?: { html?: string } };
}

export async function runActivationAcceptance(): Promise<void> {
  await vscode.commands.executeCommand('moyu.openBooks');
  const firstPanel = (await vscode.commands.executeCommand(
    'moyu.openBooks',
  )) as PanelHandle;
  const secondPanel = (await vscode.commands.executeCommand(
    'moyu.open2048',
  )) as PanelHandle;
  assert.equal(
    secondPanel,
    firstPanel,
    'Moyu must reuse one main WebviewPanel per VS Code window.',
  );
  const commands = await vscode.commands.getCommands(true);

  for (const command of [
    'moyu.open',
    'moyu.openBooks',
    'moyu.open2048',
    'moyu.openSettings',
    'moyu.toggleBossMode',
  ]) {
    assert.equal(commands.includes(command), true, `${command} is missing`);
  }

  const panel = (await vscode.commands.executeCommand(
    'moyu.openSettings',
  )) as PanelHandle;
  assert.equal(panel, firstPanel);
  assert.equal(panel?.isVisible, true);

  assert.match(panel?.panel?.webview?.html ?? '', /data-session-id=/);
  for (const section of [
    'home',
    'books',
    'reader',
    'game2048',
    'settings',
  ] as const) {
    panel?.open?.(section);
    assert.equal(panel?.captureSnapshot?.().route, section);
  }

  await vscode.commands.executeCommand('moyu.openSettings');
  await vscode.commands.executeCommand('moyu.toggleBossMode');
  await vscode.commands.executeCommand('moyu.toggleBossMode');
  assert.equal(panel?.captureSnapshot?.().panelTitle, 'Moyu');

  const pickerOptions: { filters?: Record<string, readonly string[]> }[] = [];
  const cancelled = await pickBookUri({
    showOpenDialog: async (options: vscode.OpenDialogOptions) => {
      pickerOptions.push(options);
      return undefined;
    },
  } as never);
  assert.equal(cancelled, undefined);
  assert.deepEqual(pickerOptions[0]?.filters, {
    'TXT and EPUB books': ['txt', 'epub'],
  });

  const contextWrites: Array<[string, boolean]> = [];
  const contexts = new ContextKeys((key, value) => {
    contextWrites.push([key, value]);
  });
  contexts.set({ isOpen: true, isVisible: true, isBossMode: false });
  assert.deepEqual(contexts.snapshot(), {
    isOpen: true,
    isVisible: true,
    isBossMode: false,
  });
  contexts.clear();
  assert.deepEqual(contexts.snapshot(), {
    isOpen: false,
    isVisible: false,
    isBossMode: false,
  });
  assert.deepEqual(contextWrites, [
    ['moyu.isOpen', true],
    ['moyu.isVisible', true],
    ['moyu.isBossMode', false],
    ['moyu.isOpen', false],
    ['moyu.isVisible', false],
    ['moyu.isBossMode', false],
  ]);

  let restored:
    | { windowId: string; panel: unknown; section: string }
    | undefined;
  const serializer = new PanelSerializer(
    {
      restore(windowId: string, restoredPanel: unknown, section: string) {
        restored = { windowId, panel: restoredPanel, section };
        return undefined;
      },
    } as never,
    'acceptance-window',
  );
  const serializedPanel = {};
  await serializer.deserializeWebviewPanel(serializedPanel as never, {
    route: 'game2048',
  });
  assert.deepEqual(restored, {
    windowId: 'acceptance-window',
    panel: serializedPanel,
    section: 'books',
  });

  panel?.dispose?.();
  assert.equal(panel?.isVisible, false);
  assert.equal(
    await vscode.commands.executeCommand('moyu.toggleBossMode'),
    undefined,
  );
  const reopened = (await vscode.commands.executeCommand(
    'moyu.openSettings',
  )) as PanelHandle;
  assert.notEqual(reopened, panel);
  assert.equal(reopened?.isVisible, true);
}
