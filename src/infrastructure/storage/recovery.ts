import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import { acquireFileLock, type LockHandle } from './fileLock';
import {
  fileErrorCode,
  nodeFileOperations,
  type FileOperations,
} from './nodeFileOps';

export interface JsonTransactionPaths {
  stateDirectory: string;
  current: string;
  backup: string;
  lock: string;
}

export type JsonValidator<T> = (value: unknown) => value is T;

export interface NormalizedJsonTransactionPaths extends JsonTransactionPaths {
  stateDirectory: string;
  current: string;
  backup: string;
  lock: string;
}

export interface RecoveryDependencies {
  fileOps: FileOperations;
  acquireFileLock: typeof acquireFileLock;
  uuid: () => string;
}

export type StateRecoveryErrorCode =
  | 'STATE_PATH_OUTSIDE_STORAGE'
  | 'STATE_INVALID_GENERATION'
  | 'STATE_GENERATION_CONFLICT'
  | 'STATE_RECOVERY_ISOLATION_FAILED';

export class StateRecoveryError extends Error {
  constructor(
    readonly code: StateRecoveryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StateRecoveryError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function comparablePath(path: string): string {
  return process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path;
}

export function normalizeTransactionPaths(
  paths: JsonTransactionPaths,
): NormalizedJsonTransactionPaths {
  if (
    !isAbsolute(paths.stateDirectory) ||
    !isAbsolute(paths.current) ||
    !isAbsolute(paths.backup) ||
    !isAbsolute(paths.lock)
  ) {
    throw new StateRecoveryError(
      'STATE_PATH_OUTSIDE_STORAGE',
      'State transaction paths must be absolute.',
    );
  }

  const normalized = {
    stateDirectory: resolve(paths.stateDirectory),
    current: resolve(paths.current),
    backup: resolve(paths.backup),
    lock: resolve(paths.lock),
  };
  const root = comparablePath(normalized.stateDirectory);
  const files = [normalized.current, normalized.backup, normalized.lock];
  if (
    files.some((path) => comparablePath(dirname(path)) !== root) ||
    new Set(files.map(comparablePath)).size !== files.length
  ) {
    throw new StateRecoveryError(
      'STATE_PATH_OUTSIDE_STORAGE',
      'State transaction files must be distinct direct children of one storage directory.',
    );
  }
  return normalized;
}

function generationOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('generation' in value)) {
    return undefined;
  }
  const generation = (value as { generation?: unknown }).generation;
  return Number.isSafeInteger(generation) && (generation as number) >= 0
    ? (generation as number)
    : undefined;
}

interface ValidCandidate<T> {
  path: string;
  value: T;
  generation: number;
  serialized: string;
  priority: number;
}

async function isolateInvalidCandidate(
  path: string,
  dependencies: Pick<RecoveryDependencies, 'fileOps' | 'uuid'>,
): Promise<void> {
  try {
    await dependencies.fileOps.rename(
      path,
      `${path}.invalid.${dependencies.uuid()}`,
    );
  } catch (error) {
    if (fileErrorCode(error) !== 'ENOENT') {
      throw new StateRecoveryError(
        'STATE_RECOVERY_ISOLATION_FAILED',
        'An invalid state candidate could not be isolated.',
        { cause: error },
      );
    }
  }
}

async function readCandidate<T>(
  path: string,
  priority: number,
  validate: JsonValidator<T>,
  dependencies: Pick<RecoveryDependencies, 'fileOps' | 'uuid'>,
): Promise<ValidCandidate<T> | undefined> {
  const kind = await dependencies.fileOps.entryKind(path);
  if (kind === 'missing') {
    return undefined;
  }
  if (kind !== 'file') {
    await isolateInvalidCandidate(path, dependencies);
    return undefined;
  }

  let value: unknown;
  let serialized: string;
  try {
    serialized = await dependencies.fileOps.readUtf8(path);
    value = JSON.parse(serialized) as unknown;
  } catch {
    await isolateInvalidCandidate(path, dependencies);
    return undefined;
  }
  const generation = generationOf(value);
  if (!validate(value) || generation === undefined) {
    await isolateInvalidCandidate(path, dependencies);
    return undefined;
  }
  return { path, value, generation, serialized, priority };
}

export async function readValidatedJsonCandidate<T>(
  path: string,
  validate: JsonValidator<T>,
  dependencies: Pick<RecoveryDependencies, 'fileOps' | 'uuid'>,
): Promise<{ value: T; generation: number; serialized: string } | undefined> {
  return readCandidate(path, 0, validate, dependencies);
}

function completedTempNames(currentPath: string, names: string[]): string[] {
  const prefix = `${basename(currentPath)}.tmp.`;
  return names.filter((name) => {
    if (!name.startsWith(prefix)) {
      return false;
    }
    return UUID_PATTERN.test(name.slice(prefix.length));
  });
}

export async function recoverJsonStateUnlocked<T>(
  paths: NormalizedJsonTransactionPaths,
  validate: JsonValidator<T>,
  dependencies: Pick<RecoveryDependencies, 'fileOps' | 'uuid'>,
): Promise<T | undefined> {
  const names = await dependencies.fileOps.list(paths.stateDirectory);
  const candidates = [
    await readCandidate(paths.current, 0, validate, dependencies),
    await readCandidate(paths.backup, 2, validate, dependencies),
  ];
  for (const name of completedTempNames(paths.current, names)) {
    candidates.push(
      await readCandidate(
        resolve(paths.stateDirectory, name),
        1,
        validate,
        dependencies,
      ),
    );
  }

  const valid = candidates.filter(
    (candidate): candidate is ValidCandidate<T> => candidate !== undefined,
  );
  if (valid.length === 0) {
    return undefined;
  }
  valid.sort(
    (left, right) =>
      right.generation - left.generation || left.priority - right.priority,
  );
  const selected = valid[0]!;
  const conflicting = valid.find(
    (candidate) =>
      candidate.generation === selected.generation &&
      candidate.serialized !== selected.serialized,
  );
  if (conflicting !== undefined) {
    throw new StateRecoveryError(
      'STATE_GENERATION_CONFLICT',
      'State candidates disagree at the same generation.',
    );
  }
  return selected.value;
}

async function releasePreservingError(
  lock: LockHandle,
  primaryError: unknown,
): Promise<void> {
  try {
    await lock.release();
  } catch (releaseError) {
    if (primaryError !== undefined) {
      throw new AggregateError(
        [primaryError, releaseError],
        'State recovery and lock release both failed.',
      );
    }
    throw releaseError;
  }
}

export function createJsonRecoveryManager(
  overrides: Partial<RecoveryDependencies> = {},
): {
  recoverJsonState: <T>(
    paths: JsonTransactionPaths,
    validate: JsonValidator<T>,
  ) => Promise<T | undefined>;
} {
  const dependencies: RecoveryDependencies = {
    fileOps: nodeFileOperations,
    acquireFileLock,
    uuid: randomUUID,
    ...overrides,
  };
  return {
    async recoverJsonState<T>(
      paths: JsonTransactionPaths,
      validate: JsonValidator<T>,
    ): Promise<T | undefined> {
      const normalized = normalizeTransactionPaths(paths);
      const lock = await dependencies.acquireFileLock(normalized.lock);
      let primaryError: unknown;
      try {
        await lock.assertOwned();
        return await recoverJsonStateUnlocked(
          normalized,
          validate,
          dependencies,
        );
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        await releasePreservingError(lock, primaryError);
      }
    },
  };
}

const defaultRecoveryManager = createJsonRecoveryManager();

export function recoverJsonState<T>(
  paths: JsonTransactionPaths,
  validate: JsonValidator<T>,
): Promise<T | undefined> {
  // Standalone recovery is the critical-reader entry point and therefore uses
  // the same per-module lease as mutations. transactJson calls the unlocked core.
  return defaultRecoveryManager.recoverJsonState(paths, validate);
}
