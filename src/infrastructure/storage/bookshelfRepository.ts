import {
  nextEnvelope,
  StateConflict,
  type VersionedEnvelope,
} from '../../domain/persistence/envelope';
import type {
  BookshelfData,
  BookshelfOperation,
  Repository,
} from '../../application/persistence/repositories';
import { createModuleTransactionPaths } from './recovery';
import { createJsonTransactionManager } from './fileTransaction';

const empty: BookshelfData = { books: [], tombstones: [] };
function guard(value: unknown): value is VersionedEnvelope<BookshelfData> {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<VersionedEnvelope<unknown>>;
  const d = e.data as Partial<BookshelfData> | undefined;
  return (
    Number.isSafeInteger(e.schemaVersion) &&
    Number.isSafeInteger(e.version) &&
    Number.isSafeInteger(e.generation) &&
    Number.isFinite(e.updatedAt) &&
    Array.isArray(d?.books) &&
    Array.isArray(d?.tombstones)
  );
}

export class BookshelfRepository implements Repository<BookshelfData> {
  private readonly tx = createJsonTransactionManager();
  constructor(
    private readonly storageRoot: string,
    private readonly now = Date.now,
  ) {}
  async read() {
    return this.tx.recoverJsonState(
      createModuleTransactionPaths(this.storageRoot, 'bookshelf'),
      guard,
    );
  }
  async mutate(
    baseVersion: number,
    operation: BookshelfOperation,
  ): Promise<VersionedEnvelope<BookshelfData>> {
    return this.tx.transactJson(
      createModuleTransactionPaths(this.storageRoot, 'bookshelf'),
      guard,
      (current) => {
        if (current !== undefined && current.version !== baseVersion)
          throw new StateConflict();
        const data = structuredClone(current?.data ?? empty);
        if (operation.kind === 'add') {
          const tombstone = data.tombstones.find(
            (t) => t.bookId === operation.book.id,
          );
          if (!tombstone || operation.book.addedAt > tombstone.removedAt) {
            if (!data.books.some((book) => book.id === operation.book.id))
              data.books.push(operation.book);
          }
        } else if (operation.kind === 'remove') {
          data.books = data.books.filter(
            (book) => book.id !== operation.bookId,
          );
          const removedAt = operation.removedAt ?? this.now();
          const existing = data.tombstones.find(
            (t) => t.bookId === operation.bookId,
          );
          if (existing)
            existing.removedAt = Math.max(existing.removedAt, removedAt);
          else
            data.tombstones.push({
              bookId: operation.bookId,
              removedAt,
              version: (current?.version ?? -1) + 1,
            });
        } else if (operation.kind === 'relocate') {
          const book = data.books.find((item) => item.id === operation.bookId);
          if (book) {
            book.uri = operation.uri;
            if (operation.fingerprint !== undefined)
              book.fingerprint = operation.fingerprint;
            if (operation.size !== undefined) book.size = operation.size;
            if (operation.modifiedAt !== undefined)
              book.modifiedAt = operation.modifiedAt;
          }
        } else if (operation.kind === 'touch') {
          const book = data.books.find((item) => item.id === operation.bookId);
          if (book) book.lastOpenedAt = operation.lastOpenedAt;
        } else {
          const book = data.books.find((item) => item.id === operation.bookId);
          if (book) book.encoding = operation.encoding;
        }
        return nextEnvelope(current, data, this.now());
      },
    );
  }
}
