import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BookMetadata } from '../../domain/books/types';
import type { TxtIndexManifest } from '../../domain/reader/txtIndex';
import { isTxtIndexManifest } from './indexManifest';

function indexDirectory(root: string, bookId: string): string {
  const safeBookId = encodeURIComponent(bookId).replaceAll('.', '%2E');
  return join(root, 'indexes', safeBookId);
}

export class IndexStore {
  constructor(private readonly storageRoot: string) {}

  async remove(bookId: string): Promise<void> {
    await rm(indexDirectory(this.storageRoot, bookId), {
      recursive: true,
      force: true,
    });
  }

  async save(manifest: TxtIndexManifest, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted)
      throw signal.reason ?? new Error('Index build was cancelled.');
    const directory = indexDirectory(this.storageRoot, manifest.bookId);
    await mkdir(directory, { recursive: true });
    const temp = join(directory, `manifest.json.tmp.${randomUUID()}`);
    try {
      if (signal?.aborted)
        throw signal.reason ?? new Error('Index build was cancelled.');
      await writeFile(temp, JSON.stringify(manifest), 'utf8');
      if (signal?.aborted)
        throw signal.reason ?? new Error('Index build was cancelled.');
      await rename(temp, join(directory, 'manifest.json'));
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async loadValid(book: BookMetadata): Promise<TxtIndexManifest | undefined> {
    if (book.type !== 'txt' || book.encoding === undefined) return undefined;
    const path = join(
      indexDirectory(this.storageRoot, book.id),
      'manifest.json',
    );
    try {
      const value: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isTxtIndexManifest(value)) return undefined;
      return value.bookId === book.id &&
        value.uri === book.uri &&
        value.size === book.size &&
        value.modifiedAt === book.modifiedAt &&
        value.fingerprint === book.fingerprint &&
        value.encoding === book.encoding
        ? value
        : undefined;
    } catch {
      return undefined;
    }
  }
}
