import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
import {
  createModuleTransactionPaths,
  recoverJsonState,
} from '../../../src/infrastructure/storage/recovery';
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

const claimTokens = [
  '80000000-0000-4000-8000-000000000008',
  '90000000-0000-4000-8000-000000000009',
  'a0000000-0000-4000-8000-00000000000a',
  'b0000000-0000-4000-8000-00000000000b',
  'c0000000-0000-4000-8000-00000000000c',
  'd0000000-0000-4000-8000-00000000000d',
];

function nestedClaimResidue(lockPath: string, claimDepth: number): string {
  let path = `${lockPath}.stale.${claimTokens[0]!}`;
  for (let index = 0; index < claimDepth; index += 1) {
    const kind = index % 2 === 0 ? 'stale' : 'failed';
    path = `${path}.claim.${kind}.${claimTokens[index + 1]!}`;
  }
  return path;
}

function managerWith(
  fileOps = createNodeFileOperations(),
  uuid: () => string = (() => {
    let index = 0;
    return () => uuidValues[index++] ?? uuidValues.at(-1)!;
  })(),
  reportMaintenanceError?: (error: unknown) => void,
) {
  const lockManager = createFileLockManager({ fileOps, uuid });
  return createJsonTransactionManager({
    fileOps,
    acquireFileLock: lockManager.acquireFileLock,
    uuid,
    reportMaintenanceError,
  });
}

async function writeState(path: string, value: TestState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), 'utf8');
}

async function writeRaw(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function temporaryEvents(
  events: FileOperationEvent[],
  currentPath: string,
): FileOperationEvent[] {
  const prefix = `${basename(currentPath)}.tmp.`;
  return events.filter((event) => basename(event.path).startsWith(prefix));
}

function startChild(
  executable: string,
  script: string,
  args: string[],
): { completed: Promise<void> } {
  const completed = new Promise<void>((resolvePromise, reject) => {
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
  return { completed };
}

async function runChild(
  executable: string,
  script: string,
  args: string[],
): Promise<void> {
  await startChild(executable, script, args).completed;
}

async function waitForFile(path: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, 10);
      });
    }
  }
  throw new Error(
    `Timed out waiting for child-process signal within ${timeoutMs}ms: ${path}`,
  );
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
        (await listNames(paths.stateDirectory)).filter((name) =>
          name.includes('.tmp.'),
        ),
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
      expect(await listNames(paths.stateDirectory)).toEqual(
        expect.arrayContaining([
          'state.json',
          'state.json.tmp.20000000-0000-4000-8000-000000000002',
        ]),
      );
    });
  });

  it('retires completed temporary and stale-lock residue after a durable commit', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(3));
      await writeState(
        `${paths.current}.tmp.60000000-0000-4000-8000-000000000006`,
        state(1),
      );
      await writeState(
        `${paths.current}.tmp.70000000-0000-4000-8000-000000000007`,
        state(2),
      );
      await writeRaw(
        `${paths.lock}.stale.80000000-0000-4000-8000-000000000008`,
        '{"owner":"dead"}',
      );
      await writeRaw(
        `${paths.lock}.stale.90000000-0000-4000-8000-000000000009.claim.stale.a0000000-0000-4000-8000-00000000000a`,
        '{"claim":"dead"}',
      );
      await writeRaw(
        `${paths.lock}.failed.b0000000-0000-4000-8000-00000000000b`,
        '{"lock":"incomplete"}',
      );

      await expect(
        managerWith().transactJson(paths, isTestState, () => state(4)),
      ).resolves.toEqual(state(4));

      expect(await listNames(paths.stateDirectory)).toEqual([
        'state.json',
        'state.json.backup',
      ]);
    });
  });

  it('retires bounded nested stale-claim residue after a durable commit', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      const residuePath = nestedClaimResidue(paths.lock, 2);
      await writeState(paths.current, state(3));
      await writeRaw(residuePath, '{"claim":"orphaned"}');

      await expect(
        managerWith().transactJson(paths, isTestState, () => state(4)),
      ).resolves.toEqual(state(4));
      await expect(
        createNodeFileOperations().entryKind(residuePath),
      ).resolves.toBe('missing');
    });
  });

  it('returns the durable commit when post-commit residue cleanup fails', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      const residuePath = `${paths.lock}.stale.${claimTokens[0]!}`;
      const cleanupFailure = new Error('injected residue cleanup failure');
      const maintenanceErrors: unknown[] = [];
      await writeState(paths.current, state(3));
      await writeRaw(residuePath, '{"owner":"dead"}');
      const fileOps = new InstrumentedFileOperations((event) => {
        if (event.operation === 'unlink' && event.path === residuePath) {
          return cleanupFailure;
        }
        return undefined;
      });

      await expect(
        managerWith(fileOps, undefined, (error) => {
          maintenanceErrors.push(error);
        }).transactJson(paths, isTestState, () => state(4)),
      ).resolves.toEqual(state(4));
      expect(maintenanceErrors).toEqual([cleanupFailure]);
      await expect(
        managerWith().recoverJsonState(paths, isTestState),
      ).resolves.toEqual(state(4));
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

  it('releases a held child-process lock only after the contender reports EEXIST', async () => {
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
      const readyPath = join(directory, 'holder-ready');
      const releasePath = join(directory, 'holder-release');
      const contenderStartedPath = join(directory, 'contender-started');
      const contentionPath = join(directory, 'contender-eexist');
      const holder = startChild(process.execPath, script, [
        'hold-lock',
        directory,
        'held',
        readyPath,
        releasePath,
      ]);
      void holder.completed.catch(() => undefined);
      let contender: ReturnType<typeof startChild> | undefined;
      try {
        await waitForFile(readyPath);
        contender = startChild(process.execPath, script, [
          directory,
          'held',
          '1',
          contenderStartedPath,
          contentionPath,
        ]);
        await waitForFile(contenderStartedPath);
        await waitForFile(contentionPath);
        await expect(readFile(contentionPath, 'utf8')).resolves.toBe('EEXIST');
        await expect(
          createNodeFileOperations().entryKind(
            storagePaths(directory, 'held').current,
          ),
        ).resolves.toBe('missing');

        await writeFile(releasePath, 'release', 'utf8');
        await holder.completed;
        await contender.completed;
        await expect(
          recoverJsonState(storagePaths(directory, 'held'), isTestState),
        ).resolves.toEqual({ generation: 0, version: 1, value: 1 });
      } finally {
        await writeFile(releasePath, 'release', 'utf8').catch(() => undefined);
        await Promise.allSettled([
          holder.completed,
          contender?.completed ?? Promise.resolve(),
        ]);
      }
    });
  });
});

describe('recoverJsonState', () => {
  it('scopes each module to its dedicated transaction directory', async () => {
    await withStorageDirectory(async (directory) => {
      expect(createModuleTransactionPaths(directory, 'reader')).toEqual({
        stateDirectory: join(directory, 'transactions', 'reader'),
        current: join(directory, 'transactions', 'reader', 'state.json'),
        backup: join(directory, 'transactions', 'reader', 'state.json.backup'),
        lock: join(directory, 'transactions', 'reader', 'state.lock'),
      });
    });
  });

  it('quarantines corrupt canonical JSON and returns a valid backup', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeRaw(paths.current, '{not-json');
      await writeState(paths.backup, state(4));

      await expect(recoverJsonState(paths, isTestState)).resolves.toEqual(
        state(4),
      );
      expect(await listNames(paths.stateDirectory)).toEqual(
        expect.arrayContaining([
          'state.json.backup',
          expect.stringMatching(/^state\.json\.invalid\./),
        ]),
      );
    });
  });

  it('returns undefined after isolating the only invalid JSON candidate', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeRaw(paths.current, 'null');

      await expect(
        recoverJsonState(paths, isTestState),
      ).resolves.toBeUndefined();
      expect(await listNames(paths.stateDirectory)).toEqual([
        expect.stringMatching(/^state\.json\.invalid\./),
      ]);
    });
  });

  it('propagates candidate read I/O without quarantining it or falling back', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(5));
      await writeState(paths.backup, state(4));
      let injected = false;
      const fileOps = new InstrumentedFileOperations((event) => {
        if (
          !injected &&
          event.operation === 'readUtf8' &&
          event.path === paths.current
        ) {
          injected = true;
          const error = new Error(
            'injected candidate read I/O failure',
          ) as Error & {
            code: string;
          };
          error.code = 'EIO';
          return error;
        }
        return undefined;
      });

      await expect(
        managerWith(fileOps).recoverJsonState(paths, isTestState),
      ).rejects.toMatchObject({ code: 'EIO' });
      expect(await listNames(paths.stateDirectory)).toEqual([
        'state.json',
        'state.json.backup',
      ]);
    });
  });

  it('fails closed before scanning an unbounded completed-temp set', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(0));
      for (let index = 1; index <= 65; index += 1) {
        const suffix = index.toString(16).padStart(12, '0');
        await writeState(
          `${paths.current}.tmp.60000000-0000-4000-8000-${suffix}`,
          state(1),
        );
      }

      await expect(
        managerWith().recoverJsonState(paths, isTestState),
      ).rejects.toMatchObject({ code: 'STATE_RECOVERY_RESIDUE_LIMIT' });
      expect(await listNames(paths.stateDirectory)).toHaveLength(66);
    });
  });

  it('fails closed within the inspected-entry budget before accepting arbitrary residue', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(0));
      const entries = Array.from(
        { length: 129 },
        (_unused, index) => `unrecognized-residue-${index}`,
      );
      let inspected = 0;
      const base = createNodeFileOperations();
      const fileOps = {
        ...base,
        async list(): Promise<string[]> {
          throw new Error('Recovery must not materialize a directory listing.');
        },
        async *iterateDirectory(): AsyncIterable<string> {
          for (const name of entries) {
            inspected += 1;
            yield name;
          }
        },
      };

      await expect(
        managerWith(fileOps).recoverJsonState(paths, isTestState),
      ).rejects.toMatchObject({
        code: 'STATE_RECOVERY_ENTRY_BUDGET_EXCEEDED',
      });
      expect(inspected).toBe(129);
    });
  });

  it('fails closed when a stale-claim residue exceeds the supported nesting bound', async () => {
    await withStorageDirectory(async (directory) => {
      const paths = storagePaths(directory);
      await writeState(paths.current, state(0));
      const deeplyNestedName = basename(nestedClaimResidue(paths.lock, 5));
      const base = createNodeFileOperations();
      const fileOps = {
        ...base,
        async list(): Promise<string[]> {
          return [deeplyNestedName];
        },
        async *iterateDirectory(): AsyncIterable<string> {
          yield deeplyNestedName;
        },
      };

      await expect(
        managerWith(fileOps).recoverJsonState(paths, isTestState),
      ).rejects.toMatchObject({ code: 'STATE_RECOVERY_RESIDUE_LIMIT' });
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
      await writeRaw(
        `${paths.current}.tmp.20000000-0000-4000-8000-000000000002`,
        '{broken',
      );

      await expect(recoverJsonState(paths, isTestState)).resolves.toEqual(
        state(5),
      );
      expect(await listNames(paths.stateDirectory)).toEqual(
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
