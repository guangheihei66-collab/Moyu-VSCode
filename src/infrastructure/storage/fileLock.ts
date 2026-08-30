import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import {
  fileErrorCode,
  nodeFileOperations,
  type DurableFileHandle,
  type FileOperations,
} from './nodeFileOps';

export interface FileLockTimingOptions {
  acquireTimeoutMs: number;
  heartbeatMs: number;
  staleAfterMs: number;
  retryMinMs: number;
  retryMaxMs: number;
}

export const DEFAULT_FILE_LOCK_OPTIONS: Readonly<FileLockTimingOptions> =
  Object.freeze({
    acquireTimeoutMs: 5_000,
    heartbeatMs: 2_000,
    staleAfterMs: 30_000,
    retryMinMs: 20,
    retryMaxMs: 100,
  });

export interface LockMetadata {
  ownerToken: string;
  pid: number;
  acquiredAt: number;
  renewedAt: number;
}

export type OwnerLiveness = 'alive' | 'dead' | 'uncertain';

export interface IntervalScheduler {
  setInterval(
    callback: () => void | Promise<void>,
    milliseconds: number,
  ): unknown;
  clearInterval(handle: unknown): void;
}

export interface FileLockDependencies {
  fileOps: FileOperations;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
  liveness: (pid: number) => Promise<OwnerLiveness>;
  uuid: () => string;
  pid: number;
  scheduler: IntervalScheduler;
}

export interface LockHandle {
  readonly ownerToken: string;
  assertOwned(): Promise<void>;
  release(): Promise<void>;
}

export type StateLockErrorCode =
  | 'STATE_LOCK_TIMEOUT'
  | 'STATE_LOCK_OWNERSHIP_LOST';

export class StateLockError extends Error {
  constructor(
    readonly code: StateLockErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StateLockError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUARANTINE_CLAIM_DEPTH = 2;

const defaultScheduler: IntervalScheduler = {
  setInterval(callback, milliseconds) {
    return setInterval(() => {
      void callback();
    }, milliseconds);
  },
  clearInterval(handle) {
    clearInterval(handle as NodeJS.Timeout);
  },
};

async function defaultLiveness(pid: number): Promise<OwnerLiveness> {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    return fileErrorCode(error) === 'ESRCH' ? 'dead' : 'uncertain';
  }
}

const defaultDependencies: FileLockDependencies = {
  fileOps: nodeFileOperations,
  now: Date.now,
  sleep: async (milliseconds) => {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  },
  random: Math.random,
  liveness: defaultLiveness,
  uuid: randomUUID,
  pid: process.pid,
  scheduler: defaultScheduler,
};

function asFilePath(lockUri: string | { fsPath: string }): string {
  return typeof lockUri === 'string' ? lockUri : lockUri.fsPath;
}

function validateOptions(options: FileLockTimingOptions): void {
  const values = Object.values(options);
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    options.heartbeatMs === 0 ||
    options.staleAfterMs === 0 ||
    options.retryMinMs > options.retryMaxMs
  ) {
    throw new TypeError('Invalid file-lock timing options.');
  }
}

export function isLockMetadata(value: unknown): value is LockMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const metadata = value as Partial<LockMetadata>;
  return (
    typeof metadata.ownerToken === 'string' &&
    UUID_PATTERN.test(metadata.ownerToken) &&
    Number.isSafeInteger(metadata.pid) &&
    (metadata.pid ?? 0) > 0 &&
    Number.isFinite(metadata.acquiredAt) &&
    Number.isFinite(metadata.renewedAt) &&
    (metadata.acquiredAt ?? -1) >= 0 &&
    (metadata.renewedAt ?? -1) >= (metadata.acquiredAt ?? 0)
  );
}

async function readMetadata(
  fileOps: FileOperations,
  lockPath: string,
): Promise<LockMetadata | undefined> {
  try {
    if ((await fileOps.entryKind(lockPath)) !== 'file') {
      return undefined;
    }
    const value: unknown = JSON.parse(await fileOps.readUtf8(lockPath));
    return isLockMetadata(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function ownershipLost(cause?: unknown): StateLockError {
  return new StateLockError(
    'STATE_LOCK_OWNERSHIP_LOST',
    'The state lock is no longer owned by this operation.',
    cause === undefined ? undefined : { cause },
  );
}

async function quarantineFailedAcquisition(
  dependencies: FileLockDependencies,
  lockPath: string,
  ownerToken: string,
): Promise<void> {
  await dependencies.fileOps.rename(
    lockPath,
    `${lockPath}.failed.${ownerToken}`,
  );
}

async function acquireQuarantineClaim(
  dependencies: FileLockDependencies,
  lockPath: string,
  ownerToken: string,
  deadline: number,
  options: FileLockTimingOptions,
): Promise<LockHandle | undefined> {
  // A claim can itself become stale. Bound recursive claims so lock recovery
  // fails closed rather than producing an unbounded residue-name chain.
  if (quarantineClaimDepth(lockPath) >= MAX_QUARANTINE_CLAIM_DEPTH) {
    return undefined;
  }
  const remaining = deadline - dependencies.now();
  if (remaining <= 0) {
    return undefined;
  }
  try {
    return await createFileLockManager(dependencies).acquireFileLock(
      `${lockPath}.stale.${ownerToken}.claim`,
      { ...options, acquireTimeoutMs: remaining },
    );
  } catch (error) {
    if (
      error instanceof StateLockError &&
      error.code === 'STATE_LOCK_TIMEOUT'
    ) {
      return undefined;
    }
    throw error;
  }
}

function quarantineClaimDepth(lockPath: string): number {
  return [...basename(lockPath).matchAll(/\.claim(?=\.|$)/g)].length;
}

async function releaseQuarantineClaim(
  claim: LockHandle,
  primaryError: unknown,
): Promise<void> {
  try {
    await claim.release();
  } catch (releaseError) {
    if (primaryError !== undefined) {
      throw new AggregateError(
        [primaryError, releaseError],
        'Quarantine claim work and release both failed.',
      );
    }
    throw releaseError;
  }
}

async function tryQuarantineStaleLock(
  lockPath: string,
  options: FileLockTimingOptions,
  dependencies: FileLockDependencies,
  deadline: number,
): Promise<'none' | 'quarantined' | 'uncertain'> {
  const observed = await readMetadata(dependencies.fileOps, lockPath);
  if (
    observed === undefined ||
    dependencies.now() - observed.renewedAt <= options.staleAfterMs
  ) {
    return 'none';
  }
  if ((await dependencies.liveness(observed.pid)) !== 'dead') {
    return 'none';
  }

  const claim = await acquireQuarantineClaim(
    dependencies,
    lockPath,
    observed.ownerToken,
    deadline,
    options,
  );
  if (claim === undefined) {
    return 'none';
  }

  let primaryError: unknown;
  try {
    const confirmed = await readMetadata(dependencies.fileOps, lockPath);
    if (
      confirmed === undefined ||
      confirmed.ownerToken !== observed.ownerToken ||
      confirmed.renewedAt !== observed.renewedAt ||
      dependencies.now() - confirmed.renewedAt <= options.staleAfterMs ||
      (await dependencies.liveness(confirmed.pid)) !== 'dead'
    ) {
      return 'none';
    }

    const quarantinePath = `${lockPath}.stale.${observed.ownerToken}`;
    if ((await dependencies.fileOps.entryKind(quarantinePath)) !== 'missing') {
      return 'uncertain';
    }
    try {
      await dependencies.fileOps.rename(lockPath, quarantinePath);
    } catch {
      return 'none';
    }

    const quarantined = await readMetadata(
      dependencies.fileOps,
      quarantinePath,
    );
    return quarantined?.ownerToken === observed.ownerToken
      ? 'quarantined'
      : 'uncertain';
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await releaseQuarantineClaim(claim, primaryError);
  }
}

class LeaseLockHandle implements LockHandle {
  private released = false;
  private heartbeatError: unknown;
  private heartbeatWork: Promise<void> = Promise.resolve();
  private readonly intervalHandle: unknown;

  constructor(
    private readonly lockPath: string,
    readonly ownerToken: string,
    private readonly acquiredAt: number,
    private renewedAt: number,
    private readonly fileHandle: DurableFileHandle,
    private readonly options: FileLockTimingOptions,
    private readonly dependencies: FileLockDependencies,
  ) {
    this.intervalHandle = dependencies.scheduler.setInterval(
      () => this.queueHeartbeat(),
      options.heartbeatMs,
    );
  }

  private queueHeartbeat(): Promise<void> {
    if (this.released || this.heartbeatError !== undefined) {
      return this.heartbeatWork;
    }
    this.heartbeatWork = this.heartbeatWork
      .then(async () => {
        await this.assertCanonicalOwner();
        this.renewedAt = Math.max(this.renewedAt, this.dependencies.now());
        await this.fileHandle.writeUtf8(
          JSON.stringify(this.metadata(this.renewedAt)),
        );
        await this.fileHandle.sync();
      })
      .catch((error: unknown) => {
        this.heartbeatError = error;
      });
    return this.heartbeatWork;
  }

  private metadata(renewedAt: number): LockMetadata {
    return {
      ownerToken: this.ownerToken,
      pid: this.dependencies.pid,
      acquiredAt: this.acquiredAt,
      renewedAt,
    };
  }

  private async assertCanonicalOwner(): Promise<void> {
    const metadata = await readMetadata(
      this.dependencies.fileOps,
      this.lockPath,
    );
    if (metadata?.ownerToken !== this.ownerToken) {
      throw ownershipLost();
    }
  }

  async assertOwned(): Promise<void> {
    await this.heartbeatWork;
    if (this.heartbeatError !== undefined) {
      throw ownershipLost(this.heartbeatError);
    }
    await this.assertCanonicalOwner();
  }

  async release(): Promise<void> {
    if (this.released) {
      return;
    }
    this.released = true;
    this.dependencies.scheduler.clearInterval(this.intervalHandle);
    await this.heartbeatWork;

    let releaseError: unknown = this.heartbeatError;
    try {
      await this.assertCanonicalOwner();
      await this.dependencies.fileOps.unlink(this.lockPath);
    } catch (error) {
      releaseError ??= error;
    }

    try {
      await this.fileHandle.close();
    } catch (error) {
      releaseError ??= error;
    }

    if (releaseError !== undefined) {
      throw ownershipLost(releaseError);
    }
  }
}

export function createFileLockManager(
  overrides: Partial<FileLockDependencies> = {},
): {
  acquireFileLock: (
    lockUri: string | { fsPath: string },
    options?: FileLockTimingOptions,
  ) => Promise<LockHandle>;
} {
  const dependencies: FileLockDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  return {
    async acquireFileLock(
      lockUri,
      options = DEFAULT_FILE_LOCK_OPTIONS,
    ): Promise<LockHandle> {
      validateOptions(options);
      const lockPath = asFilePath(lockUri);
      const deadline = dependencies.now() + options.acquireTimeoutMs;

      while (true) {
        let fileHandle: DurableFileHandle | undefined;
        try {
          fileHandle = await dependencies.fileOps.openExclusive(lockPath);
          const ownerToken = dependencies.uuid();
          const acquiredAt = dependencies.now();
          try {
            await fileHandle.writeUtf8(
              JSON.stringify({
                ownerToken,
                pid: dependencies.pid,
                acquiredAt,
                renewedAt: acquiredAt,
              } satisfies LockMetadata),
            );
            await fileHandle.sync();
          } catch (error) {
            const cleanupErrors: unknown[] = [];
            try {
              await fileHandle.close();
            } catch (closeError) {
              cleanupErrors.push(closeError);
            }
            try {
              await quarantineFailedAcquisition(
                dependencies,
                lockPath,
                ownerToken,
              );
            } catch (quarantineError) {
              cleanupErrors.push(quarantineError);
            }
            if (cleanupErrors.length > 0) {
              throw new AggregateError(
                [error, ...cleanupErrors],
                'Initial lock write and cleanup both failed.',
              );
            }
            throw error;
          }
          return new LeaseLockHandle(
            lockPath,
            ownerToken,
            acquiredAt,
            acquiredAt,
            fileHandle,
            options,
            dependencies,
          );
        } catch (error) {
          if (fileHandle !== undefined || fileErrorCode(error) !== 'EEXIST') {
            throw error;
          }
        }

        if (dependencies.now() >= deadline) {
          throw new StateLockError(
            'STATE_LOCK_TIMEOUT',
            'Timed out waiting for the state lock.',
          );
        }

        const quarantineResult = await tryQuarantineStaleLock(
          lockPath,
          options,
          dependencies,
          deadline,
        );
        if (quarantineResult === 'quarantined') {
          continue;
        }

        if (quarantineResult === 'uncertain') {
          const remaining = deadline - dependencies.now();
          if (remaining > 0) {
            await dependencies.sleep(remaining);
          }
          throw new StateLockError(
            'STATE_LOCK_TIMEOUT',
            'Timed out waiting for the state lock.',
          );
        }

        const remaining = deadline - dependencies.now();
        if (remaining <= 0) {
          throw new StateLockError(
            'STATE_LOCK_TIMEOUT',
            'Timed out waiting for the state lock.',
          );
        }
        const jitter =
          options.retryMinMs +
          Math.floor(
            dependencies.random() *
              (options.retryMaxMs - options.retryMinMs + 1),
          );
        await dependencies.sleep(Math.min(jitter, remaining));
      }
    },
  };
}

const defaultFileLockManager = createFileLockManager();

export function acquireFileLock(
  lockUri: string | { fsPath: string },
  options: FileLockTimingOptions = DEFAULT_FILE_LOCK_OPTIONS,
): Promise<LockHandle> {
  return defaultFileLockManager.acquireFileLock(lockUri, options);
}
