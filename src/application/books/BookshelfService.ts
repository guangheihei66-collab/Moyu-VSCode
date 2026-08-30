import { randomUUID } from 'node:crypto';
import { type VersionedEnvelope } from '../../domain/persistence/envelope';
import {
  bookTypeFromUri,
  normalizeBookUri,
  sameBookUri,
} from '../../domain/books/bookIdentity';
import type { BookMetadata, BookType, BookUri } from '../../domain/books/types';
import type { FileStatProvider } from '../../infrastructure/filesystem/fileIdentity';
import type {
  BookshelfData,
  BookshelfOperation,
} from '../persistence/repositories';

export interface BookshelfRepositoryLike {
  read(): Promise<VersionedEnvelope<BookshelfData> | undefined>;
  mutate(
    baseVersion: number,
    operation: BookshelfOperation,
  ): Promise<VersionedEnvelope<BookshelfData>>;
}

export interface BookshelfServiceOptions {
  platform?: string;
  uuid?: () => string;
  clock?: () => number;
  fileStats: FileStatProvider;
  onIndexInvalidated?: (bookId: string) => void;
}

function titleFromUri(uri: string): string {
  const path = uri.split(/[?#]/, 1)[0]!.replace(/\\/g, '/');
  return (
    decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || 'Untitled'
  );
}

export class BookshelfService {
  private readonly platform: string;
  private readonly uuid: () => string;
  private readonly clock: () => number;
  constructor(
    private readonly repository: BookshelfRepositoryLike,
    private readonly options: BookshelfServiceOptions,
  ) {
    this.platform = options.platform ?? process.platform;
    this.uuid = options.uuid ?? randomUUID;
    this.clock = options.clock ?? Date.now;
  }

  async list(): Promise<VersionedEnvelope<BookshelfData> | undefined> {
    return this.repository.read();
  }

  async import(uri: BookUri): Promise<BookMetadata> {
    const normalizedUri = normalizeBookUri(uri, this.platform);
    const type = bookTypeFromUri(uri);
    const existingState = await this.repository.read();
    const existing = existingState?.data.books.find((book) =>
      sameBookUri(book.uri, normalizedUri, this.platform),
    );
    if (existing !== undefined && existingState !== undefined) {
      const touched = await this.repository.mutate(existingState.version, {
        kind: 'touch',
        bookId: existing.id,
        lastOpenedAt: this.clock(),
      });
      return (touched.data.books.find((book) => book.id === existing.id) ??
        existing) as unknown as BookMetadata;
    }
    const stat = await this.options.fileStats.stat(normalizedUri);
    const now = this.clock();
    const book: BookMetadata = {
      id: this.uuid(),
      title: titleFromUri(normalizedUri),
      uri: normalizedUri,
      type,
      fingerprint: stat.fingerprint,
      size: stat.size,
      modifiedAt: stat.modifiedAt,
      addedAt: now,
      metadataVersion: 1,
    };
    const result = await this.repository.mutate(existingState?.version ?? 0, {
      kind: 'add',
      book,
    });
    return (result.data.books.find((item) => item.id === book.id) ??
      book) as unknown as BookMetadata;
  }

  async remove(bookId: string): Promise<void> {
    const state = await this.repository.read();
    if (state?.data.books.some((book) => book.id === bookId) !== true) return;
    await this.repository.mutate(state.version, {
      kind: 'remove',
      bookId,
      removedAt: this.clock(),
    });
  }

  async relocate(bookId: string, uri: BookUri): Promise<BookMetadata> {
    const state = await this.repository.read();
    const current = state?.data.books.find((book) => book.id === bookId);
    if (state === undefined || current === undefined)
      throw new Error('Book was not found in the bookshelf.');
    const normalizedUri = normalizeBookUri(uri, this.platform);
    const type: BookType = bookTypeFromUri(uri);
    if (type !== current.type)
      throw new Error('Relocated book type must match the original book type.');
    const stat = await this.options.fileStats.stat(normalizedUri);
    const operation: BookshelfOperation = {
      kind: 'relocate',
      bookId,
      uri: normalizedUri,
      fingerprint: stat.fingerprint,
      size: stat.size,
      modifiedAt: stat.modifiedAt,
    };
    const result = await this.repository.mutate(state.version, operation);
    this.options.onIndexInvalidated?.(bookId);
    return (result.data.books.find((book) => book.id === bookId) ??
      current) as unknown as BookMetadata;
  }
}
