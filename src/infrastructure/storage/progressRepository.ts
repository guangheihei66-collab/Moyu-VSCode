import {
  nextEnvelope,
  StateConflict,
  type VersionedEnvelope,
} from '../../domain/persistence/envelope';
import type {
  ProgressData,
  ReadingCheckpoint,
  Repository,
} from '../../application/persistence/repositories';
import { createJsonTransactionManager } from './fileTransaction';
import { createModuleTransactionPaths } from './recovery';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCheckpoint(value: unknown): value is ReadingCheckpoint {
  if (!isRecord(value)) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, 'locator') &&
    typeof value.percentage === 'number' &&
    Number.isFinite(value.percentage) &&
    value.percentage >= 0 &&
    value.percentage <= 1 &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt >= 0
  );
}

const guard = (value: unknown): value is VersionedEnvelope<ProgressData> => {
  if (!isRecord(value)) return false;
  const e = value as Partial<VersionedEnvelope<unknown>>;
  if (
    !Number.isSafeInteger(e.schemaVersion) ||
    !Number.isSafeInteger(e.version) ||
    !Number.isSafeInteger(e.generation) ||
    !Number.isFinite(e.updatedAt) ||
    !isRecord(e.data)
  ) {
    return false;
  }
  const data = e.data as Partial<ProgressData>;
  if (!isRecord(data.byBookId) || !isRecord(data.versions)) return false;
  return (
    Object.values(data.byBookId).every(isCheckpoint) &&
    Object.values(data.versions).every(
      (version) => Number.isSafeInteger(version) && (version as number) >= 0,
    )
  );
};
export class ProgressRepository implements Repository<ProgressData> {
  private readonly tx = createJsonTransactionManager();
  constructor(
    private readonly storageRoot: string,
    private readonly now = Date.now,
  ) {}
  async read() {
    return this.tx.recoverJsonState(
      createModuleTransactionPaths(this.storageRoot, 'progress'),
      guard,
    );
  }
  async remove(bookId: string): Promise<void> {
    if (typeof bookId !== 'string' || bookId.length === 0)
      throw new TypeError('The book id is invalid.');
    await this.tx.transactJson(
      createModuleTransactionPaths(this.storageRoot, 'progress'),
      guard,
      (current) => {
        const data = structuredClone(
          current?.data ?? { byBookId: {}, versions: {} },
        );
        delete data.byBookId[bookId];
        delete data.versions[bookId];
        return nextEnvelope(current, data, this.now());
      },
    );
  }
  async save(
    bookId: string,
    baseVersion: number,
    checkpoint: ReadingCheckpoint,
  ): Promise<VersionedEnvelope<ProgressData>> {
    if (
      typeof bookId !== 'string' ||
      bookId.length === 0 ||
      !Number.isSafeInteger(baseVersion) ||
      baseVersion < 0 ||
      !isCheckpoint(checkpoint)
    ) {
      throw new TypeError('The reading progress input is invalid.');
    }
    return this.tx.transactJson(
      createModuleTransactionPaths(this.storageRoot, 'progress'),
      guard,
      (current) => {
        const data = structuredClone(
          current?.data ?? { byBookId: {}, versions: {} },
        );
        const known = data.versions[bookId] ?? 0;
        if (
          current !== undefined &&
          known > baseVersion &&
          current.version !== baseVersion
        )
          throw new StateConflict();
        const previous = data.byBookId[bookId];
        if (
          previous === undefined ||
          checkpoint.updatedAt >= previous.updatedAt
        )
          data.byBookId[bookId] = checkpoint;
        data.versions[bookId] = known + 1;
        return nextEnvelope(current, data, this.now());
      },
    );
  }
}
