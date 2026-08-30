import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { BookMetadata } from '../../domain/books/types';
import type { EpubBookIndex } from '../../domain/reader/epub';

interface CacheEnvelope {
  schemaVersion: 1;
  source: { fingerprint: string; size: number; modifiedAt: number };
  index: EpubBookIndex;
}

export class EpubCache {
  constructor(private readonly root: string) {}
  async remove(bookId: string): Promise<void> {
    await rm(path.dirname(this.file(bookId)), { recursive: true, force: true });
  }
  async load(book: BookMetadata): Promise<EpubBookIndex | undefined> {
    try {
      const value = JSON.parse(
        await readFile(this.file(book.id), 'utf8'),
      ) as CacheEnvelope;
      return value.schemaVersion === 1 &&
        value.source.fingerprint === book.fingerprint &&
        value.source.size === book.size &&
        value.source.modifiedAt === book.modifiedAt &&
        isIndex(value.index)
        ? value.index
        : undefined;
    } catch {
      return undefined;
    }
  }
  async save(book: BookMetadata, index: EpubBookIndex): Promise<void> {
    const directory = path.dirname(this.file(book.id));
    await mkdir(directory, { recursive: true });
    const temp = path.join(directory, `index.json.tmp.${randomUUID()}`);
    const value: CacheEnvelope = {
      schemaVersion: 1,
      source: {
        fingerprint: book.fingerprint,
        size: book.size,
        modifiedAt: book.modifiedAt,
      },
      index,
    };
    try {
      await writeFile(temp, JSON.stringify(value), 'utf8');
      await rename(temp, this.file(book.id));
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
  private file(bookId: string): string {
    const safe = encodeURIComponent(bookId).replaceAll('.', '%2E');
    return path.join(this.root, 'epub', safe, 'index.json');
  }
}

function isIndex(value: unknown): value is EpubBookIndex {
  if (typeof value !== 'object' || value === null) return false;
  const index = value as Partial<EpubBookIndex>;
  return (
    index.schemaVersion === 1 &&
    typeof index.sourceFingerprint === 'string' &&
    Array.isArray(index.chapters) &&
    index.chapters.every(
      (chapter) =>
        typeof chapter.id === 'string' &&
        typeof chapter.title === 'string' &&
        Array.isArray(chapter.paragraphs) &&
        chapter.paragraphs.every((item) => typeof item === 'string') &&
        typeof chapter.contentFingerprint === 'string',
    )
  );
}
