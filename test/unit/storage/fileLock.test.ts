import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FILE_LOCK_OPTIONS,
  StateLockError,
  createFileLockManager,
  type FileLockTimingOptions,
  type LockMetadata,
} from '../../../src/infrastructure/storage/fileLock';
import {
  createNodeFileOperations,
  type FileOperations,
} from '../../../src/infrastructure/storage/nodeFileOps';
import {
  ManualScheduler,
  ManualTime,
  listNames,
  withStorageDirectory,
  writeLockMetadata,
} from '../../fixtures/storage/storageTestHarness';

const quickOptions: FileLockTimingOptions = {
  acquireTimeoutMs: 50,
  heartbeatMs: 10,
  staleAfterMs: 100,
  retryMinMs: 5,
  retryMaxMs: 5,
};

const staleOwner: LockMetadata = {
  ownerToken: '10000000-0000-4000-8000-000000000001',
  pid: 101,
  acquiredAt: 0,
  renewedAt: 0,
};

function codedError(code: string): Error & { code: string } {
  const error = new Error(`injected ${code}`) as Error & { code: string };
  error.code = code;
  return error;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe('acquireFileLock', () => {
  it('renews the same owner identity so an unexpired lease is never stolen', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      const scheduler = new ManualScheduler();
      const owner = createFileLockManager({
        now: time.now,
        sleep: time.sleep,
        scheduler,
        pid: 101,
        uuid: () => '10000000-0000-4000-8000-000000000001',
      });
      const lock = await owner.acquireFileLock(lockPath, quickOptions);
      const acquired = JSON.parse(
        await readFile(lockPath, 'utf8'),
      ) as LockMetadata;

      time.advance(80);
      await scheduler.runAll();
      const renewed = JSON.parse(
        await readFile(lockPath, 'utf8'),
      ) as LockMetadata;

      expect(renewed).toMatchObject({
        ownerToken: acquired.ownerToken,
        acquiredAt: acquired.acquiredAt,
        renewedAt: 80,
      });

      time.advance(80);
      const contender = createFileLockManager({
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        uuid: () => '20000000-0000-4000-8000-000000000002',
      });
      await expect(
        contender.acquireFileLock(lockPath, {
          ...quickOptions,
          acquireTimeoutMs: 10,
        }),
      ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
      expect(
        (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
          .ownerToken,
      ).toBe(lock.ownerToken);

      await lock.release();
      expect(scheduler.activeCount).toBe(0);
    });
  });

  it('never moves renewedAt backwards when the wall clock rolls back', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      time.value = 100;
      const scheduler = new ManualScheduler();
      const manager = createFileLockManager({
        now: time.now,
        sleep: time.sleep,
        scheduler,
        uuid: () => '10000000-0000-4000-8000-000000000001',
      });
      const lock = await manager.acquireFileLock(lockPath, quickOptions);

      time.value = 50;
      await scheduler.runAll();

      expect(
        (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
          .renewedAt,
      ).toBe(100);
      await expect(lock.assertOwned()).resolves.toBeUndefined();
      await expect(lock.release()).resolves.toBeUndefined();
      expect(scheduler.activeCount).toBe(0);
    });
  });

  it('treats default ESRCH liveness as clear death and EPERM as uncertainty', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      time.value = 1_000;
      await writeLockMetadata(lockPath, staleOwner);
      const kill = vi.spyOn(process, 'kill');

      try {
        kill.mockImplementation(() => {
          throw codedError('ESRCH');
        });
        const recovered = await createFileLockManager({
          now: time.now,
          sleep: time.sleep,
          uuid: (() => {
            const values = [
              '20000000-0000-4000-8000-000000000002',
              '30000000-0000-4000-8000-000000000003',
            ];
            return () =>
              values.shift() ?? '40000000-0000-4000-8000-000000000004';
          })(),
        }).acquireFileLock(lockPath, quickOptions);
        await recovered.release();

        await writeLockMetadata(lockPath, staleOwner);
        time.value = 1_000;
        kill.mockImplementation(() => {
          throw codedError('EPERM');
        });
        await expect(
          createFileLockManager({
            now: time.now,
            sleep: time.sleep,
          }).acquireFileLock(lockPath, quickOptions),
        ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
        expect(
          (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
            .ownerToken,
        ).toBe(staleOwner.ownerToken);
      } finally {
        kill.mockRestore();
      }
    });
  });

  it('propagates heartbeat write failure after closing resources and clearing its timer', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const base = createNodeFileOperations();
      let writes = 0;
      let closes = 0;
      const fileOps: FileOperations = {
        ...base,
        async openExclusive(path) {
          const handle = await base.openExclusive(path);
          return {
            async writeUtf8(content) {
              writes += 1;
              if (writes === 2) {
                throw new Error('injected heartbeat write failure');
              }
              await handle.writeUtf8(content);
            },
            sync: () => handle.sync(),
            async close() {
              closes += 1;
              await handle.close();
            },
          };
        },
      };
      const scheduler = new ManualScheduler();
      const manager = createFileLockManager({ fileOps, scheduler });
      const lock = await manager.acquireFileLock(lockPath, quickOptions);

      await scheduler.runAll();

      await expect(lock.assertOwned()).rejects.toMatchObject({
        code: 'STATE_LOCK_OWNERSHIP_LOST',
      });
      await expect(lock.release()).rejects.toMatchObject({
        code: 'STATE_LOCK_OWNERSHIP_LOST',
      });
      expect(scheduler.activeCount).toBe(0);
      expect(closes).toBe(1);
      await expect(base.entryKind(lockPath)).resolves.toBe('missing');
    });
  });

  it('blocks a delayed stale contender before it can rename a fresh canonical owner', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      time.value = 1_000;
      await writeLockMetadata(lockPath, staleOwner);
      const base = createNodeFileOperations();
      const renameEntered = deferred();
      const allowRename = deferred();
      let renamedOwnerToken: string | undefined;
      const delayedScheduler = new ManualScheduler();
      const winnerScheduler = new ManualScheduler();
      const delayedFileOps: FileOperations = {
        ...base,
        async rename(source, destination) {
          if (source === lockPath && destination.includes('.stale.')) {
            renameEntered.resolve();
            await allowRename.promise;
            renamedOwnerToken = (
              JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata
            ).ownerToken;
          }
          await base.rename(source, destination);
        },
      };
      const delayed = createFileLockManager({
        fileOps: delayedFileOps,
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        scheduler: delayedScheduler,
        uuid: () => '20000000-0000-4000-8000-000000000002',
      });
      const winner = createFileLockManager({
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        scheduler: winnerScheduler,
        uuid: () => '30000000-0000-4000-8000-000000000003',
      });
      const delayedAcquire = delayed.acquireFileLock(lockPath, quickOptions);
      await renameEntered.promise;

      const winnerResult = await winner
        .acquireFileLock(lockPath, quickOptions)
        .then(
          (lock) => ({ lock }),
          (error: unknown) => ({ error }),
        );
      allowRename.resolve();
      const delayedResult = await delayedAcquire.then(
        (lock) => ({ lock }),
        (error: unknown) => ({ error }),
      );

      try {
        expect(renamedOwnerToken).toBe(staleOwner.ownerToken);
        expect(winnerResult).toHaveProperty('error');
        expect(delayedResult).toHaveProperty('lock');
      } finally {
        await Promise.allSettled([
          winnerResult.lock?.release() ?? Promise.resolve(),
          delayedResult.lock?.release() ?? Promise.resolve(),
        ]);
      }
      expect(delayedScheduler.activeCount).toBe(0);
      expect(winnerScheduler.activeCount).toBe(0);
    });
  });

  it('recovers a crashed owner only after lease expiry and clear death', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      await writeLockMetadata(lockPath, staleOwner);
      const manager = createFileLockManager({
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        uuid: (() => {
          const values = [
            '20000000-0000-4000-8000-000000000002',
            '30000000-0000-4000-8000-000000000003',
          ];
          return () => values.shift() ?? '40000000-0000-4000-8000-000000000004';
        })(),
      });

      await expect(
        manager.acquireFileLock(lockPath, quickOptions),
      ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
      expect(await listNames(directory)).toEqual(['module.lock']);

      time.value = 151;
      const lock = await manager.acquireFileLock(lockPath, quickOptions);
      expect(lock.ownerToken).toBe('30000000-0000-4000-8000-000000000003');
      expect(await listNames(directory)).toContain(
        `module.lock.stale.${staleOwner.ownerToken}`,
      );
      await lock.release();
    });
  });

  it.each([
    ['alive', 'live but slow'],
    ['uncertain', 'uncertain'],
  ] as const)(
    'never steals an expired lease when owner death is %s (%s)',
    async (liveness) => {
      await withStorageDirectory(async (directory) => {
        const lockPath = join(directory, 'module.lock');
        const time = new ManualTime();
        time.value = 1_000;
        await writeLockMetadata(lockPath, staleOwner);
        const manager = createFileLockManager({
          now: time.now,
          sleep: time.sleep,
          liveness: async () => liveness,
        });

        await expect(
          manager.acquireFileLock(lockPath, quickOptions),
        ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
        expect(
          (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
            .ownerToken,
        ).toBe(staleOwner.ownerToken);
        expect(await listNames(directory)).toEqual(['module.lock']);
      });
    },
  );

  it('uses the exact five-second default deadline and stable timeout code', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      await writeLockMetadata(lockPath, {
        ...staleOwner,
        renewedAt: 1_000_000,
      });
      const manager = createFileLockManager({
        now: time.now,
        sleep: time.sleep,
        random: () => 0,
      });

      let caught: unknown;
      try {
        await manager.acquireFileLock(lockPath, DEFAULT_FILE_LOCK_OPTIONS);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(StateLockError);
      expect(caught).toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
      expect(time.value).toBe(DEFAULT_FILE_LOCK_OPTIONS.acquireTimeoutMs);
      expect(Math.min(...time.sleeps)).toBe(
        DEFAULT_FILE_LOCK_OPTIONS.retryMinMs,
      );
      expect(Math.max(...time.sleeps)).toBe(
        DEFAULT_FILE_LOCK_OPTIONS.retryMinMs,
      );
    });
  });

  it('never follows a non-file lock entry while deciding stale takeover', async () => {
    const time = new ManualTime();
    let reads = 0;
    const existsError = new Error('exists') as Error & { code: string };
    existsError.code = 'EEXIST';
    const fileOps: FileOperations = {
      async openExclusive() {
        throw existsError;
      },
      async readUtf8() {
        reads += 1;
        throw new Error('must not follow symbolic-link metadata');
      },
      async entryKind() {
        return 'symbolic-link';
      },
      async rename() {
        throw new Error('must not quarantine an uncertain entry');
      },
      async unlink() {
        throw new Error('not used');
      },
      async list() {
        return [];
      },
    };
    const manager = createFileLockManager({
      fileOps,
      now: time.now,
      sleep: time.sleep,
    });

    await expect(
      manager.acquireFileLock('C:\\state\\module.lock', quickOptions),
    ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
    expect(reads).toBe(0);
  });

  it('settles the new handle and reports both initial-write and quarantine failures', async () => {
    let closes = 0;
    const fileOps: FileOperations = {
      async openExclusive() {
        return {
          async writeUtf8() {
            throw new Error('injected metadata write failure');
          },
          async sync() {},
          async close() {
            closes += 1;
          },
        };
      },
      async readUtf8() {
        throw new Error('not used');
      },
      async entryKind() {
        return 'file';
      },
      async rename() {
        throw new Error('injected quarantine failure');
      },
      async unlink() {
        throw new Error('not used');
      },
      async list() {
        return [];
      },
    };
    const manager = createFileLockManager({ fileOps });

    const caught = await manager
      .acquireFileLock('C:\\state\\module.lock', quickOptions)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(closes).toBe(1);
    expect(caught).toBeInstanceOf(AggregateError);
    expect(
      (caught as AggregateError).errors.map((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      ),
    ).toEqual([
      'injected metadata write failure',
      'injected quarantine failure',
    ]);
  });

  it('allows exactly one stale-quarantine winner before normal acquisition resumes', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      await writeLockMetadata(lockPath, staleOwner);
      const managers = [
        createFileLockManager({
          liveness: async () => 'dead',
          uuid: () => '20000000-0000-4000-8000-000000000002',
        }),
        createFileLockManager({
          liveness: async () => 'dead',
          uuid: () => '30000000-0000-4000-8000-000000000003',
        }),
      ];
      const options = { ...quickOptions, acquireTimeoutMs: 250 };
      const firstPromise = managers[0].acquireFileLock(lockPath, options);
      const secondPromise = managers[1].acquireFileLock(lockPath, options);
      const results = await Promise.allSettled([firstPromise, secondPromise]);
      const acquired = results
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<
            Awaited<ReturnType<(typeof managers)[number]['acquireFileLock']>>
          > => result.status === 'fulfilled',
        )
        .map((result) => result.value);

      try {
        expect(acquired).toHaveLength(1);
        await expect(acquired[0]?.assertOwned()).resolves.toBeUndefined();
        expect(
          results.filter(
            (result) =>
              result.status === 'rejected' &&
              (result.reason as { code?: unknown }).code ===
                'STATE_LOCK_TIMEOUT',
          ),
        ).toHaveLength(1);

        const staleMetadata = await Promise.all(
          (await listNames(directory))
            .filter((name) => name.startsWith('module.lock.stale.'))
            .map(
              async (name) =>
                JSON.parse(
                  await readFile(join(directory, name), 'utf8'),
                ) as LockMetadata,
            ),
        );
        expect(
          staleMetadata.filter(
            (metadata) => metadata.ownerToken === staleOwner.ownerToken,
          ),
        ).toHaveLength(1);
      } finally {
        await Promise.allSettled(acquired.map((handle) => handle.release()));
      }
    });
  });

  it('does not disturb a live lock created after its stale source is quarantined', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      time.value = 1_000;
      await writeLockMetadata(lockPath, staleOwner);
      const liveReplacement: LockMetadata = {
        ownerToken: '90000000-0000-4000-8000-000000000009',
        pid: 909,
        acquiredAt: 1_000,
        renewedAt: 1_000,
      };
      const base = createNodeFileOperations();
      let injected = false;
      const fileOps: FileOperations = {
        ...base,
        async rename(source, destination) {
          if (
            !injected &&
            source === lockPath &&
            destination.includes('.stale.')
          ) {
            injected = true;
            await base.rename(source, destination);
            await writeLockMetadata(lockPath, liveReplacement);
            return;
          }
          await base.rename(source, destination);
        },
      };
      const manager = createFileLockManager({
        fileOps,
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        uuid: () => '20000000-0000-4000-8000-000000000002',
      });
      let unexpectedHandle:
        | Awaited<ReturnType<typeof manager.acquireFileLock>>
        | undefined;

      try {
        const result = await manager
          .acquireFileLock(lockPath, quickOptions)
          .then(
            (handle) => {
              unexpectedHandle = handle;
              return undefined;
            },
            (error: unknown) => error,
          );
        expect(result).toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
        expect(
          (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
            .ownerToken,
        ).toBe(liveReplacement.ownerToken);
      } finally {
        await unexpectedHandle?.release();
      }
    });
  });

  it('never replaces a fresh canonical owner during an unexpected stale-quarantine race', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      time.value = 1_000;
      await writeLockMetadata(lockPath, staleOwner);
      const movedOwner: LockMetadata = {
        ownerToken: '80000000-0000-4000-8000-000000000008',
        pid: 808,
        acquiredAt: 1_000,
        renewedAt: 1_000,
      };
      const freshCanonicalOwner: LockMetadata = {
        ownerToken: '90000000-0000-4000-8000-000000000009',
        pid: 909,
        acquiredAt: 1_000,
        renewedAt: 1_000,
      };
      const base = createNodeFileOperations();
      let quarantinePath: string | undefined;
      const fileOps: FileOperations = {
        ...base,
        async rename(source, destination) {
          if (source === lockPath && destination.includes('.stale.')) {
            await writeLockMetadata(lockPath, movedOwner);
            await base.rename(source, destination);
            quarantinePath = destination;
            await writeLockMetadata(lockPath, freshCanonicalOwner);
            return;
          }
          if (source === quarantinePath && destination === lockPath) {
            // Exercise filesystems whose rename replaces an existing destination.
            await base.unlink(destination);
          }
          await base.rename(source, destination);
        },
      };
      const manager = createFileLockManager({
        fileOps,
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        uuid: (() => {
          const values = [
            '20000000-0000-4000-8000-000000000002',
            '30000000-0000-4000-8000-000000000003',
          ];
          return () => values.shift() ?? '40000000-0000-4000-8000-000000000004';
        })(),
      });

      await expect(
        manager.acquireFileLock(lockPath, quickOptions),
      ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
      expect(
        (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
          .ownerToken,
      ).toBe(freshCanonicalOwner.ownerToken);
      expect(
        (JSON.parse(await readFile(quarantinePath!, 'utf8')) as LockMetadata)
          .ownerToken,
      ).toBe(movedOwner.ownerToken);
    });
  });

  it('times out rather than acquiring when an ABA lock cannot be restored', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const time = new ManualTime();
      time.value = 1_000;
      await writeLockMetadata(lockPath, staleOwner);
      const liveReplacement: LockMetadata = {
        ownerToken: '90000000-0000-4000-8000-000000000009',
        pid: 909,
        acquiredAt: 1_000,
        renewedAt: 1_000,
      };
      const base = createNodeFileOperations();
      let quarantinePath: string | undefined;
      const fileOps: FileOperations = {
        ...base,
        async rename(source, destination) {
          if (source === lockPath && destination.includes('.stale.')) {
            await writeLockMetadata(lockPath, liveReplacement);
            quarantinePath = destination;
          } else if (
            quarantinePath !== undefined &&
            source === quarantinePath
          ) {
            const error = new Error('injected restore uncertainty') as Error & {
              code: string;
            };
            error.code = 'EACCES';
            throw error;
          }
          await base.rename(source, destination);
        },
      };
      const manager = createFileLockManager({
        fileOps,
        now: time.now,
        sleep: time.sleep,
        liveness: async () => 'dead',
        uuid: () => '20000000-0000-4000-8000-000000000002',
      });

      await expect(
        manager.acquireFileLock(lockPath, quickOptions),
      ).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
      expect(time.value).toBe(1_000 + quickOptions.acquireTimeoutMs);
      expect(quarantinePath).toBeDefined();
      expect(
        (JSON.parse(await readFile(quarantinePath!, 'utf8')) as LockMetadata)
          .ownerToken,
      ).toBe(liveReplacement.ownerToken);
    });
  });

  it('refuses to release a canonical lock whose ownerToken changed', async () => {
    await withStorageDirectory(async (directory) => {
      const lockPath = join(directory, 'module.lock');
      const manager = createFileLockManager({
        uuid: () => '10000000-0000-4000-8000-000000000001',
      });
      const lock = await manager.acquireFileLock(lockPath, quickOptions);
      await writeLockMetadata(lockPath, {
        ownerToken: '20000000-0000-4000-8000-000000000002',
        pid: 202,
        acquiredAt: 0,
        renewedAt: 0,
      });

      await expect(lock.release()).rejects.toMatchObject({
        code: 'STATE_LOCK_OWNERSHIP_LOST',
      });
      expect(
        (JSON.parse(await readFile(lockPath, 'utf8')) as LockMetadata)
          .ownerToken,
      ).toBe('20000000-0000-4000-8000-000000000002');
    });
  });

  it('serializes one module while allowing a different module to proceed', async () => {
    await withStorageDirectory(async (directory) => {
      const manager = createFileLockManager();
      const options = { ...quickOptions, acquireTimeoutMs: 1_000 };
      const moduleA = join(directory, 'a.lock');
      const moduleB = join(directory, 'b.lock');
      const firstA = await manager.acquireFileLock(moduleA, options);
      let secondAResolved = false;
      const secondAPromise = manager
        .acquireFileLock(moduleA, options)
        .then((lock) => {
          secondAResolved = true;
          return lock;
        });

      const lockB = await manager.acquireFileLock(moduleB, options);
      expect(secondAResolved).toBe(false);
      await lockB.release();
      await firstA.release();
      const secondA = await secondAPromise;
      await secondA.release();
    });
  });
});
