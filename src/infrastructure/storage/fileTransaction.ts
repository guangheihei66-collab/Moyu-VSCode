import { randomUUID } from 'node:crypto';

import { acquireFileLock, type LockHandle } from './fileLock';
import {
  nodeFileOperations,
  type DurableFileHandle,
  type FileOperations,
} from './nodeFileOps';
import {
  createJsonRecoveryManager,
  normalizeTransactionPaths,
  readValidatedJsonCandidate,
  recoverJsonStateUnlocked,
  type JsonTransactionPaths,
  type JsonValidator,
  type RecoveryDependencies,
} from './recovery';

export type StateTransactionErrorCode =
  | 'STATE_VERSION_CONFLICT'
  | 'STATE_INVALID_NEXT_STATE'
  | 'STATE_GENERATION_NOT_ADVANCED'
  | 'STATE_COMMIT_VALIDATION_FAILED';

export class StateTransactionError extends Error {
  constructor(
    readonly code: StateTransactionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StateTransactionError';
  }
}

export interface JsonTransactionDependencies extends RecoveryDependencies {
  fileOps: FileOperations;
  acquireFileLock: typeof acquireFileLock;
  uuid: () => string;
}

// Mutation callbacks run while the module lease is held. Callers must precompute
// indexing, parsing, scans, UI waits, and user input before entering this API.
export type JsonMutation<T> = (current: T | undefined) => T | Promise<T>;

function generationOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('generation' in value)) {
    return undefined;
  }
  const generation = (value as { generation?: unknown }).generation;
  return Number.isSafeInteger(generation) && (generation as number) >= 0
    ? (generation as number)
    : undefined;
}

async function closePreservingError(
  handle: DurableFileHandle,
  primaryError: unknown,
): Promise<void> {
  try {
    await handle.close();
  } catch (closeError) {
    if (primaryError !== undefined) {
      throw new AggregateError(
        [primaryError, closeError],
        'Temporary state write and close both failed.',
      );
    }
    throw closeError;
  }
}

async function writeFlushClose(
  path: string,
  serialized: string,
  fileOps: FileOperations,
): Promise<void> {
  const handle = await fileOps.openExclusive(path);
  let primaryError: unknown;
  try {
    await handle.writeUtf8(serialized);
    await handle.sync();
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closePreservingError(handle, primaryError);
  }
}

async function rotateValidatedBackup<T>(
  paths: ReturnType<typeof normalizeTransactionPaths>,
  validate: JsonValidator<T>,
  dependencies: JsonTransactionDependencies,
): Promise<void> {
  const current = await readValidatedJsonCandidate(
    paths.current,
    validate,
    dependencies,
  );
  if (current === undefined) {
    return;
  }
  await dependencies.fileOps.rename(paths.current, paths.backup);
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
        'State transaction and lock release both failed.',
      );
    }
    throw releaseError;
  }
}

export function createJsonTransactionManager(
  overrides: Partial<JsonTransactionDependencies> = {},
): {
  transactJson: <T>(
    paths: JsonTransactionPaths,
    validate: JsonValidator<T>,
    mutate: JsonMutation<T>,
  ) => Promise<T>;
  recoverJsonState: <T>(
    paths: JsonTransactionPaths,
    validate: JsonValidator<T>,
  ) => Promise<T | undefined>;
} {
  const dependencies: JsonTransactionDependencies = {
    fileOps: nodeFileOperations,
    acquireFileLock,
    uuid: randomUUID,
    ...overrides,
  };
  const recovery = createJsonRecoveryManager(dependencies);

  return {
    recoverJsonState: recovery.recoverJsonState,
    async transactJson<T>(
      paths: JsonTransactionPaths,
      validate: JsonValidator<T>,
      mutate: JsonMutation<T>,
    ): Promise<T> {
      const normalized = normalizeTransactionPaths(paths);
      const lock = await dependencies.acquireFileLock(normalized.lock);
      let primaryError: unknown;
      try {
        await lock.assertOwned();
        const current = await recoverJsonStateUnlocked(
          normalized,
          validate,
          dependencies,
        );
        await lock.assertOwned();
        const next = await mutate(current);
        const nextGeneration = generationOf(next);
        if (!validate(next) || nextGeneration === undefined) {
          throw new StateTransactionError(
            'STATE_INVALID_NEXT_STATE',
            'The mutation returned an invalid state envelope.',
          );
        }
        const currentGeneration = generationOf(current) ?? -1;
        if (nextGeneration <= currentGeneration) {
          throw new StateTransactionError(
            'STATE_GENERATION_NOT_ADVANCED',
            'The mutation did not advance the state generation.',
          );
        }

        const serialized = JSON.stringify(next);
        const tempPath = `${normalized.current}.tmp.${dependencies.uuid()}`;
        await lock.assertOwned();
        await writeFlushClose(tempPath, serialized, dependencies.fileOps);
        await lock.assertOwned();
        await rotateValidatedBackup(normalized, validate, dependencies);
        await dependencies.fileOps.rename(tempPath, normalized.current);
        await lock.assertOwned();

        const committed = await readValidatedJsonCandidate(
          normalized.current,
          validate,
          dependencies,
        );
        if (
          committed === undefined ||
          committed.generation !== nextGeneration ||
          committed.serialized !== serialized
        ) {
          throw new StateTransactionError(
            'STATE_COMMIT_VALIDATION_FAILED',
            'The committed state could not be validated.',
          );
        }
        return committed.value;
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        await releasePreservingError(lock, primaryError);
      }
    },
  };
}

const defaultTransactionManager = createJsonTransactionManager();

export function transactJson<T>(
  paths: JsonTransactionPaths,
  validate: JsonValidator<T>,
  mutate: JsonMutation<T>,
): Promise<T> {
  return defaultTransactionManager.transactJson(paths, validate, mutate);
}
