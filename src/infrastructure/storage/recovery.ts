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
  | 'STATE_RECOVERY_ISOLATION_FAILED'
  | 'STATE_RECOVERY_RESIDUE_LIMIT';

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

const MAX_COMPLETED_TEMP_CANDIDATES = 64;

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

  // A read error says nothing about the candidate's validity. It propagates
  // rather than falling back to an older generation or quarantining this file.
  const serialized = await dependencies.fileOps.readUtf8(path);

  let value: unknown;
  try {
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

function quarantineResidueNames(lockPath: string, names: string[]): string[] {
  const lockBase = basename(lockPath);
  const stalePrefix = `${lockBase}.stale.`;
  const failedPrefix = `${lockBase}.failed.`;
  const uuidContent = UUID_PATTERN.source.slice(1, -1);
  const staleClaimResidue = new RegExp(
    `^${escapeRegExp(lockBase)}\\.stale\\.${uuidContent}\\.claim\\.(?:stale|failed)\\.${uuidContent}$`,
    'i',
  );
  return names.filter(
    (name) =>
      (name.startsWith(stalePrefix) &&
        UUID_PATTERN.test(name.slice(stalePrefix.length))) ||
      (name.startsWith(failedPrefix) &&
        UUID_PATTERN.test(name.slice(failedPrefix.length))) ||
      staleClaimResidue.test(name),
  );
}

function invalidCandidateNames(
  paths: NormalizedJsonTransactionPaths,
  names: string[],
): string[] {
  const currentBase = basename(paths.current);
  const backupBase = basename(paths.backup);
  const exactPrefixes = [`${currentBase}.invalid.`, `${backupBase}.invalid.`];
  const tempInvalid = new RegExp(
    `^${escapeRegExp(currentBase)}\\.tmp\\.${UUID_PATTERN.source.slice(1, -1)}\\.invalid\\.${UUID_PATTERN.source.slice(1, -1)}$`,
    'i',
  );
  return names.filter(
    (name) =>
      exactPrefixes.some(
        (prefix) =>
          name.startsWith(prefix) &&
          UUID_PATTERN.test(name.slice(prefix.length)),
      ) || tempInvalid.test(name),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function unlinkIfRegularFile(
  path: string,
  dependencies: Pick<RecoveryDependencies, 'fileOps'>,
): Promise<void> {
  if ((await dependencies.fileOps.entryKind(path)) === 'file') {
    await dependencies.fileOps.unlink(path);
  }
}

export async function recoverJsonStateUnlocked<T>(
  paths: NormalizedJsonTransactionPaths,
  validate: JsonValidator<T>,
  dependencies: Pick<RecoveryDependencies, 'fileOps' | 'uuid'>,
): Promise<T | undefined> {
  const names = await dependencies.fileOps.list(paths.stateDirectory);
  const temporaryNames = completedTempNames(paths.current, names);
  if (temporaryNames.length > MAX_COMPLETED_TEMP_CANDIDATES) {
    throw new StateRecoveryError(
      'STATE_RECOVERY_RESIDUE_LIMIT',
      'Too many completed temporary state candidates require manual recovery.',
    );
  }
  const candidates = [
    await readCandidate(paths.current, 0, validate, dependencies),
    await readCandidate(paths.backup, 2, validate, dependencies),
  ];
  for (const name of temporaryNames) {
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

export async function retireRecoveryResidue<T>(
  paths: NormalizedJsonTransactionPaths,
  validate: JsonValidator<T>,
  committedGeneration: number,
  dependencies: Pick<RecoveryDependencies, 'fileOps' | 'uuid'>,
): Promise<void> {
  const names = await dependencies.fileOps.list(paths.stateDirectory);
  const temporaryNames = completedTempNames(paths.current, names);
  if (temporaryNames.length > MAX_COMPLETED_TEMP_CANDIDATES) {
    throw new StateRecoveryError(
      'STATE_RECOVERY_RESIDUE_LIMIT',
      'Too many completed temporary state candidates require manual recovery.',
    );
  }

  for (const name of temporaryNames) {
    const candidatePath = resolve(paths.stateDirectory, name);
    const candidate = await readCandidate(
      candidatePath,
      1,
      validate,
      dependencies,
    );
    if (
      candidate !== undefined &&
      candidate.generation <= committedGeneration
    ) {
      await unlinkIfRegularFile(candidatePath, dependencies);
    }
  }

  for (const name of [
    ...quarantineResidueNames(paths.lock, names),
    ...invalidCandidateNames(paths, names),
  ]) {
    await unlinkIfRegularFile(
      resolve(paths.stateDirectory, name),
      dependencies,
    );
  }
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
