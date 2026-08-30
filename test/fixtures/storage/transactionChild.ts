import { createFileLockManager } from '../../../src/infrastructure/storage/fileLock';
import { createJsonTransactionManager } from '../../../src/infrastructure/storage/fileTransaction';
import { createNodeFileOperations } from '../../../src/infrastructure/storage/nodeFileOps';
import { isTestState, storagePaths } from './storageTestHarness';

async function main(): Promise<void> {
  const [stateDirectory, moduleName, countText] = process.argv.slice(2);
  if (
    stateDirectory === undefined ||
    moduleName === undefined ||
    countText === undefined
  ) {
    throw new Error('Expected state directory, module name, and count.');
  }
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Count must be a positive integer.');
  }

  const fileOps = createNodeFileOperations();
  const lockManager = createFileLockManager({ fileOps });
  const transactions = createJsonTransactionManager({
    fileOps,
    acquireFileLock: lockManager.acquireFileLock,
  });
  const paths = storagePaths(stateDirectory, moduleName);

  for (let index = 0; index < count; index += 1) {
    await transactions.transactJson(paths, isTestState, (current) => ({
      generation: (current?.generation ?? -1) + 1,
      version: (current?.version ?? 0) + 1,
      value: (current?.value ?? 0) + 1,
    }));
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Child transaction failed.',
  );
  process.exitCode = 1;
});
