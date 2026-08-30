import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  BlobReader,
  Uint8ArrayWriter,
  ZipReader,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js';
import { EPUB_LIMITS, EpubSecurityError, assertWithinLimit } from './limits';

interface FileUri {
  fsPath: string;
}

export class BoundedZip {
  private constructor(
    private readonly reader: ZipReader<Blob>,
    private readonly files: ReadonlyMap<string, FileEntry>,
  ) {}

  get entries(): readonly string[] {
    return [...this.files.keys()];
  }

  static async open(uri: FileUri): Promise<BoundedZip> {
    const source = await stat(uri.fsPath);
    assertWithinLimit(
      'EPUB source bytes',
      source.size,
      EPUB_LIMITS.sourceBytes,
    );
    const reader = new ZipReader(new BlobReader(await openAsBlob(uri.fsPath)));
    try {
      const entries = await reader.getEntries();
      assertWithinLimit('ZIP entries', entries.length, EPUB_LIMITS.entries);
      const files = validateEntries(entries);
      return new BoundedZip(reader, files);
    } catch (error) {
      await reader.close().catch(() => undefined);
      if (
        typeof error === 'object' &&
        error !== null &&
        'filename' in error &&
        typeof error.filename === 'string'
      ) {
        canonicalEntryPath(error.filename);
      }
      throw error;
    }
  }

  async read(name: string): Promise<Uint8Array> {
    const canonical = canonicalEntryPath(name);
    const entry = this.files.get(canonical);
    if (entry === undefined) {
      throw new EpubSecurityError(
        'EPUB_INVALID_ARCHIVE',
        'ZIP entry not found',
      );
    }
    const bytes = await entry.getData(new Uint8ArrayWriter(), {
      onprogress: (loaded) =>
        assertWithinLimit(
          'expanded entry bytes',
          loaded,
          EPUB_LIMITS.entryBytes,
        ),
    });
    assertWithinLimit(
      'expanded entry bytes',
      bytes.byteLength,
      EPUB_LIMITS.entryBytes,
    );
    return bytes;
  }

  async close(): Promise<void> {
    await this.reader.close();
  }
}

function validateEntries(
  entries: readonly Entry[],
): ReadonlyMap<string, FileEntry> {
  const files = new Map<string, FileEntry>();
  let expandedBytes = 0;
  for (const entry of entries) {
    const name = canonicalEntryPath(entry.filename, entry.directory);
    if (entry.directory) continue;
    if (entry.encrypted || entry.symlink) {
      throw new EpubSecurityError(
        'EPUB_INVALID_ARCHIVE',
        'Unsupported ZIP entry',
      );
    }
    assertWithinLimit(
      'ZIP entry bytes',
      entry.uncompressedSize,
      EPUB_LIMITS.entryBytes,
    );
    expandedBytes += entry.uncompressedSize;
    assertWithinLimit(
      'ZIP expanded bytes',
      expandedBytes,
      EPUB_LIMITS.expandedBytes,
    );
    const ratio =
      entry.compressedSize === 0
        ? entry.uncompressedSize === 0
          ? 0
          : Number.POSITIVE_INFINITY
        : entry.uncompressedSize / entry.compressedSize;
    if (ratio > EPUB_LIMITS.compressionRatio) {
      throw new EpubSecurityError(
        'EPUB_LIMIT_EXCEEDED',
        'ZIP compression ratio exceeds the EPUB safety limit',
      );
    }
    if (files.has(name)) {
      throw new EpubSecurityError(
        'EPUB_INVALID_ARCHIVE',
        'Duplicate ZIP entry',
      );
    }
    files.set(name, entry);
  }
  return files;
}

function canonicalEntryPath(name: string, directory = false): string {
  if (
    name.length === 0 ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[a-z]:/i.test(name)
  ) {
    throw new EpubSecurityError('EPUB_UNSAFE_PATH', 'Unsafe ZIP entry path');
  }
  const path = directory && name.endsWith('/') ? name.slice(0, -1) : name;
  const parts = path.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new EpubSecurityError('EPUB_UNSAFE_PATH', 'Unsafe ZIP entry path');
  }
  return parts.join('/');
}
