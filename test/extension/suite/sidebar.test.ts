import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
      const extension = vscode.extensions.all.find(
        (candidate) => candidate.packageJSON?.name === 'moyu-vscode',
      );
      assert.ok(extension, 'Moyu extension must be discoverable in the Host.');
      assert.equal(
        existsSync(
          join(extension.extensionPath, 'dist', 'webview', 'sidebar.js'),
        ),
        true,
        'packaged Sidebar JavaScript must exist in the active extension',
      );
      assert.equal(
        existsSync(
          join(extension.extensionPath, 'dist', 'webview', 'sidebar.css'),
        ),
        true,
        'packaged Sidebar CSS must exist in the active extension',
      );
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }

  assert.deepEqual(await readSidebarStatus(), {
    registered: true,
    resolved: true,
  });
}
