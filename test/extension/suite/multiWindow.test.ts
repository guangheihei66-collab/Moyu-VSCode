import { strict as assert } from 'node:assert';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import * as vscode from 'vscode';

import {
  createModuleTransactionPaths,
  recoverJsonState,
} from '../../../src/infrastructure/storage/recovery';

interface TestState {
  generation: number;
  version: number;
  value: number;
}

function isTestState(value: unknown): value is TestState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<TestState>;
  return (
    Number.isSafeInteger(state.generation) &&
    Number.isSafeInteger(state.version) &&
    Number.isSafeInteger(state.value) &&
    (state.generation ?? -1) >= 0 &&
    (state.version ?? -1) >= 0 &&
    (state.value ?? -1) >= 0
  );
}

function waitForExit(
  executable: string,
  script: string,
  args: readonly string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [script, ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Transaction child failed: ${stderr}`));
    });
  });
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

export async function runMultiWindowAcceptance(): Promise<void> {
  await vscode.commands.executeCommand('moyu.openBooks');
  const fixtureRoot = process.env.MOYU_TEST_FIXTURE_ROOT;
  const childScript = process.env.MOYU_TEST_TRANSACTION_CHILD;
  const nodeExecutable = process.env.MOYU_TEST_NODE_EXECUTABLE;
  assert.ok(fixtureRoot, 'The isolated fixture root is not configured.');
  assert.ok(childScript, 'The transaction child is not configured.');
  assert.ok(nodeExecutable, 'The Node executable is not configured.');

  const stateRoot = join(fixtureRoot, 'multi-window-state');
  const started = join(stateRoot, 'started');
  const tasks = Array.from({ length: 3 }, (_, index) => {
    const args = [stateRoot, 'shared', '4'];
    if (index === 0) args.push(started);
    return waitForExit(nodeExecutable, childScript, args);
  });
  await waitForFile(started);
  await Promise.all(tasks);

  const state = await recoverJsonState(
    createModuleTransactionPaths(stateRoot, 'shared'),
    isTestState,
  );
  assert.deepEqual(state, { generation: 11, version: 12, value: 12 });
}
