import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

interface SidebarStatus {
  registered: boolean;
  resolved: boolean;
}

async function readSidebarStatus(): Promise<SidebarStatus> {
  return (await vscode.commands.executeCommand(
    'moyu.__testSidebarStatus',
  )) as SidebarStatus;
}

export async function runSidebarProviderAcceptance(): Promise<void> {
  const registered = await readSidebarStatus();
  assert.deepEqual(registered, { registered: true, resolved: false });

  await vscode.commands.executeCommand('workbench.view.extension.moyu');
  await vscode.commands.executeCommand(
    'workbench.action.openView',
    'moyu.sidebar',
  );

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const status = await readSidebarStatus();
    if (status.resolved) {
      assert.deepEqual(status, { registered: true, resolved: true });
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }

  assert.deepEqual(await readSidebarStatus(), {
    registered: true,
    resolved: true,
  });
}
