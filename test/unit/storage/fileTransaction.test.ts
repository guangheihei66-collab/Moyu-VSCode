import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import { createFileLockManager } from '../../../src/infrastructure/storage/fileLock';
import {
  StateTransactionError,
  createJsonTransactionManager,
  transactJson,
} from '../../../src/infrastructure/storage/fileTransaction';
import { createNodeFileOperations } from '../../../src/infrastructure/storage/nodeFileOps';
import { recoverJsonState } from '../../../src/infrastructure/storage/recovery';
import {
  InstrumentedFileOperations,
  isTestState,
  listNames,
  storagePaths,
  type FileOperationEvent,
  type TestState,
  withStorageDirectory,
} from '../../fixtures/storage/storageTestHarness';

const uuidValues = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005',
];

function state(generation: number, value = generation): TestState {
  return { generation, version: generation, value };
}

function managerWith(
  fileOps = createNodeFileOperations(),
  uuid: () => string = (() => {
    let index = 0;
    return () => uuidValues[index++] ?? uuidValues.at(-1)!;
  })(),
) {
  const lockManager = createFileLockManager({ fileOps, uuid });
  return createJsonTransactionManager({
    fileOps,
    acquireFileLock: lockManager.acquireFileLock,
    uuid,
  });
}

async function writeState(path: string, value: TestState): Promise<void> {
  await writeFile(path, JSON.stringify(value), 'utf8');
}

function temporaryEvents(
  events: FileOperationEvent[],
  currentPath: string,
): FileOperationEvent[] {
  const prefix = `${basename(currentPath)}.tmp.`;
  return events.filter((event) => basename(event.path).startsWith(prefix));
}

async function runChild(
  executable: string,
  script: string,
  args: string[],
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Child exited with ${code}: ${stderr}`));
      }
    });
  });
}

describe('transactJson', () => {
  it('lets the mutation layer reject a stale base version without changing state', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(3));

      await expect(
        transactJson(paths, isTestState, (current) => {
          if (current?.version !== 2) {
            throw new StateTransactionError(
              'STATE_VERSION_CONFLICT',
              'The requested base version is stale.',
            );
          }
          return state(4);
        }),
      ).rejects.toMatchObject({ code: 'STATE_VERSION_CONFLICT' });

      expect(await recoverJsonState(paths, isTestState)).toEqual(state(3));
    });
  });

  it('writes a unique temp, flushes it, closes it, and then promotes it', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      const fileOps = new InstrumentedFileOperations();
      const transactions = managerWith(fileOps);

      await expect(
        transactions.transactJson(paths, isTestState, () => state(0)),
      ).resolves.toEqual(state(0));

      const operations = temporaryEvents(fileOps.events, paths.current).map(
        ({ operation }) => operation,
      );
      expect(operations).toEqual([
        'openExclusive',
        'writeUtf8',
        'sync',
        'close',
        'rename',
      ]);
      expect(
        (await listNames(directory)).filter((name) => name.includes('.tmp.')),
      ).toEqual([]);
    });
  });

  it('closes a unique temp handle when its write fails', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      let failed = false;
      const fileOps = new InstrumentedFileOperations((event) => {
        if (
          !failed &&
          event.operation === 'writeUtf8' &&
          event.path.includes('.json.tmp.')
        ) {
          failed = true;
          return new Error('injected temp write failure');
        }
        return undefined;
      });
      const transactions = managerWith(fileOps);

      await expect(
        transactions.transactJson(paths, isTestState, () => state(0)),
      ).rejects.toThrow('injected temp write failure');
      expect(
        temporaryEvents(fileOps.events, paths.current).at(-1)?.operation,
      ).toBe('close');
      await expect(
        managerWith().recoverJsonState(paths, isTestState),
      ).resolves.toBeUndefined();
    });
  });

  it.each([
    ['during backup rotation', 'rotate-backup'],
    ['after backup rotation and before canonical rename', 'promote'],
    ['after canonical rename and before committed reread', 'committed-read'],
  ] as const)(
    'recovers the highest valid generation after a crash %s',
    async (_label, point) => {
      await withStorageDirectory(async (directory) => {
        const paths = storagePaths(directory);
        await writeState(paths.current, state(6));
        let promoted = false;
        const fileOps = new InstrumentedFileOperations((event) => {
          const isTemp = event.path.includes('.json.tmp.');
          if (
            point === 'rotate-backup' &&
            event.operation === 'rename' &&
            event.path === paths.current &&
            event.destination === paths.backup
          ) {
            return new Error('injected backup rotation crash');
          }
          if (
            event.operation === 'rename' &&
            isTemp &&
            event.destination === paths.current
          ) {
            if (point === 'promote') {
              return new Error('injected pre-promotion crash');
            }
            promoted = true;
          }
          if (
            point === 'committed-read' &&
            promoted &&
            event.operation === 'entryKind' &&
            event.path === paths.current
          ) {
            return new Error('injected committed reread crash');
          }
          return undefined;
        });

        await expect(
          managerWith(fileOps).transactJson(paths, isTestState, () => state(7)),
        ).rejects.toThrow(/injected/);
        await expect(recoverJsonState(paths, isTestState)).resolves.toEqual(
          state(7),
        );
      });
    },
  );

  it('preserves a recoverable valid generation when backup rotation fails', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(3));
      await writeState(paths.backup, state(2));
      const fileOps = new InstrumentedFileOperations((event) => {
        if (
          event.operation === 'rename' &&
          event.path === paths.current &&
          event.destination === paths.backup
        ) {
          return new Error('injected backup replacement failure');
        }
        return undefined;
      });

      await expect(
        managerWith(fileOps).transactJson(paths, isTestState, () => state(4)),
      ).rejects.toThrow('injected backup replacement failure');
      await expect(recoverJsonState(paths, isTestState)).resolves.toEqual(
        state(4),
      );
      expect(await listNames(directory)).toEqual(
        expect.arrayContaining([
          'module.json',
          'module.json.tmp.20000000-0000-4000-8000-000000000002',
        ]),
      );
    });
  });

  it('serializes competing Windows child processes without losing writes', async () => {
    await withStorageDirectory(async (directory) => {
      const script = join(directory, 'transaction-child.cjs');
      await build({
        entryPoints: [resolve('test/fixtures/storage/transactionChild.ts')],
        outfile: script,
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20.18',
        logLevel: 'silent',
      });

      await Promise.all(
        Array.from({ length: 4 }, () =>
          runChild(process.execPath, script, [directory, 'shared', '5']),
        ),
      );

      await expect(
        recoverJsonState(storagePaths(directory, 'shared'), isTestState),
      ).resolves.toEqual({ generation: 19, version: 20, value: 20 });
    });
  });
});

describe('recoverJsonState', () => {
  it('quarantines corrupt canonical JSON and returns a valid backup', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeFile(paths.current, '{not-json', 'utf8');
      await writeState(paths.backup, state(4));

      await expect(recoverJsonState(paths, isTestState)).resolves.toEqual(
        state(4),
      );
      expect(await listNames(directory)).toEqual(
        expect.arrayContaining([
          'module.json.backup',
          expect.stringMatching(/^module\.json\.invalid\./),
        ]),
      );
    });
  });

  it('returns undefined after isolating the only invalid JSON candidate', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeFile(paths.current, 'null', 'utf8');

      await expect(
        recoverJsonState(paths, isTestState),
      ).resolves.toBeUndefined();
      expect(await listNames(directory)).toEqual([
        expect.stringMatching(/^module\.json\.invalid\./),
      ]);
    });
  });

  it('selects the highest valid generation from canonical, backup, and temps', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(2));
      await writeState(paths.backup, state(4));
      await writeState(
        `${paths.current}.tmp.10000000-0000-4000-8000-000000000001`,
        state(5),
      );
      await writeFile(
        `${paths.current}.tmp.20000000-0000-4000-8000-000000000002`,
        '{broken',
        'utf8',
      );

      await expect(recoverJsonState(paths, isTestState)).resolves.toEqual(
        state(5),
      );
      expect(await listNames(directory)).toEqual(
        expect.arrayContaining([expect.stringMatching(/\.invalid\./)]),
      );
    });
  });

  it('rejects transaction paths that can escape the injected state directory', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      const outside = join(dirname(directory), 'outside.json');

      await expect(
        recoverJsonState({ ...paths, current: outside }, isTestState),
      ).rejects.toMatchObject({ code: 'STATE_PATH_OUTSIDE_STORAGE' });
      await expect(
        transactJson({ ...paths, backup: outside }, isTestState, () =>
          state(0),
        ),
      ).rejects.toMatchObject({ code: 'STATE_PATH_OUTSIDE_STORAGE' });
    });
  });
});
