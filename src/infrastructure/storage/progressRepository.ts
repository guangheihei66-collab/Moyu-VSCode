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

const guard = (value: unknown): value is VersionedEnvelope<ProgressData> => {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<VersionedEnvelope<unknown>>;
  const d = e.data as Partial<ProgressData> | undefined;
  return (
    Number.isSafeInteger(e.schemaVersion) &&
    Number.isSafeInteger(e.version) &&
    Number.isSafeInteger(e.generation) &&
    Number.isFinite(e.updatedAt) &&
    typeof d?.byBookId === 'object' &&
    typeof d?.versions === 'object'
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
  async save(
    bookId: string,
    baseVersion: number,
    checkpoint: ReadingCheckpoint,
  ): Promise<VersionedEnvelope<ProgressData>> {
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
