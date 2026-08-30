import { access, writeFile } from 'node:fs/promises';

import { createFileLockManager } from '../../../src/infrastructure/storage/fileLock';
import { createJsonTransactionManager } from '../../../src/infrastructure/storage/fileTransaction';
import {
  createNodeFileOperations,
  fileErrorCode,
  type FileOperations,
} from '../../../src/infrastructure/storage/nodeFileOps';
import { isTestState, storagePaths } from './storageTestHarness';

async function waitForRelease(path: string): Promise<void> {
  while (true) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  }
}

async function runTransactions(
  stateDirectory: string,
  moduleName: string,
  countText: string,
  startedPath?: string,
  contentionPath?: string,
): Promise<void> {
  if (
    stateDirectory.length === 0 ||
    moduleName.length === 0 ||
    countText.length === 0
  ) {
    throw new Error('Expected state directory, module name, and count.');
  }
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Count must be a positive integer.');
  }

  const paths = storagePaths(stateDirectory, moduleName);
  const baseFileOps = createNodeFileOperations();
  const fileOps: FileOperations = {
    ...baseFileOps,
    async openExclusive(path) {
      try {
        return await baseFileOps.openExclusive(path);
      } catch (error) {
        if (
          contentionPath !== undefined &&
          path === paths.lock &&
          fileErrorCode(error) === 'EEXIST'
        ) {
          await writeFile(contentionPath, 'EEXIST', 'utf8');
        }
        throw error;
      }
    },
  };
  const lockManager = createFileLockManager({ fileOps });
  const transactions = createJsonTransactionManager({
    fileOps,
    acquireFileLock: lockManager.acquireFileLock,
  });
  if (startedPath !== undefined) {
    await writeFile(startedPath, 'starting', 'utf8');
  }

  for (let index = 0; index < count; index += 1) {
    await transactions.transactJson(paths, isTestState, (current) => ({
      generation: (current?.generation ?? -1) + 1,
      version: (current?.version ?? 0) + 1,
      value: (current?.value ?? 0) + 1,
    }));
  }
}

async function holdLock(
  stateDirectory: string,
  moduleName: string,
  readyPath: string,
  releasePath: string,
): Promise<void> {
  const fileOps = createNodeFileOperations();
  const paths = storagePaths(stateDirectory, moduleName);
  await fileOps.ensureDirectory(paths.stateDirectory);
  const lockManager = createFileLockManager({ fileOps });
  const lock = await lockManager.acquireFileLock(paths.lock);
  try {
    await writeFile(readyPath, 'acquired', 'utf8');
    await waitForRelease(releasePath);
  } finally {
    await lock.release();
  }
}

async function main(): Promise<void> {
  const [first, ...rest] = process.argv.slice(2);
  if (first === 'hold-lock') {
    const [stateDirectory, moduleName, readyPath, releasePath] = rest;
    if (
      stateDirectory === undefined ||
      moduleName === undefined ||
      readyPath === undefined ||
      releasePath === undefined
    ) {
      throw new Error(
        'Expected hold-lock state directory, module, and signals.',
      );
    }
    await holdLock(stateDirectory, moduleName, readyPath, releasePath);
    return;
  }

  const [moduleName, countText, startedPath, contentionPath] = rest;
  if (
    first === undefined ||
    moduleName === undefined ||
    countText === undefined
  ) {
    throw new Error('Expected state directory, module name, and count.');
  }
  await runTransactions(
    first,
    moduleName,
    countText,
    startedPath,
    contentionPath,
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Child transaction failed.',
  );
  process.exitCode = 1;
});
