import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as iconv from 'iconv-lite';
import type { BookMetadata } from '../../domain/books/types';
import type {
  ReaderBlock,
  ReaderBlockBatch,
  TxtLocator,
} from '../../domain/reader/locator';
import type {
  TxtIndexEntry,
  TxtIndexManifest,
} from '../../domain/reader/txtIndex';
import { MAX_MESSAGE_BYTES } from '../../shared/protocol/limits';
import { serializedUtf8Size } from '../../shared/protocol/validate';
import { IndexStore } from './indexStore';

const RANGE_READ_BYTES = 64 * 1024;
const MAX_READER_BLOCKS = 100;
const DEFAULT_MAX_BATCH_BYTES = MAX_MESSAGE_BYTES - 4 * 1024;
const MAX_PARAGRAPH_CHARACTERS = 256 * 1024;

export type TxtBlockReaderErrorCode =
  | 'BOOK_NOT_FOUND'
  | 'BOOK_SOURCE_MISSING'
  | 'TXT_INDEX_INVALID'
  | 'TXT_LOCATOR_INVALID'
  | 'TXT_LOCATOR_STALE'
  | 'TXT_BLOCK_TOO_LARGE'
  | 'TXT_SOURCE_CHANGED'
  | 'TXT_DECODE_FAILED'
  | 'READER_LIMIT_INVALID';

export class TxtBlockReaderError extends Error {
  constructor(
    readonly code: TxtBlockReaderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TxtBlockReaderError';
  }
}

export type BookProvider = (
  bookId: string,
) => Promise<BookMetadata | undefined>;

export interface TxtBlockReaderOptions {
  bookProvider: BookProvider;
  indexStore: Pick<IndexStore, 'loadValid'>;
  maxBatchBytes?: number;
  maxCacheEntries?: number;
}

interface CachedBlock {
  block: ReaderBlock;
  size: number;
  modifiedAt: number;
}

function sourcePath(uri: string): string {
  return uri.toLowerCase().startsWith('file:') ? fileURLToPath(uri) : uri;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function cacheKey(book: BookMetadata, entry: TxtIndexEntry): string {
  return [
    book.id,
    book.fingerprint,
    book.encoding ?? '',
    entry.blockId,
    entry.contentFingerprint,
  ].join(':');
}

export class TxtBlockReader {
  private readonly maxBatchBytes: number;
  private readonly maxCacheEntries: number;
  private readonly cache = new Map<string, CachedBlock>();

  constructor(private readonly options: TxtBlockReaderOptions) {
    this.maxBatchBytes = options.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;
    this.maxCacheEntries = options.maxCacheEntries ?? 32;
    if (
      !isPositiveInteger(this.maxBatchBytes) ||
      this.maxBatchBytes >= MAX_MESSAGE_BYTES
    ) {
      throw new RangeError(
        'Reader batch bytes must remain below the protocol limit.',
      );
    }
    if (!isPositiveInteger(this.maxCacheEntries)) {
      throw new RangeError('Reader cache size must be a positive integer.');
    }
  }

  async loadIndex(bookId: string): Promise<TxtIndexManifest> {
    const book = await this.options.bookProvider(bookId);
    if (book === undefined) {
      throw new TxtBlockReaderError('BOOK_NOT_FOUND', 'Book was not found.');
    }
    if (book.type !== 'txt' || book.encoding === undefined) {
      throw new TxtBlockReaderError(
        'TXT_INDEX_INVALID',
        'A confirmed TXT encoding is required before reading.',
      );
    }
    let sourceStat;
    try {
      sourceStat = await stat(sourcePath(book.uri));
    } catch (error) {
      throw new TxtBlockReaderError(
        'BOOK_SOURCE_MISSING',
        'The selected book source is unavailable.',
        { cause: error },
      );
    }
    if (!sourceStat.isFile()) {
      throw new TxtBlockReaderError(
        'BOOK_SOURCE_MISSING',
        'The selected book source is not a regular file.',
      );
    }
    if (sourceStat.size !== book.size) {
      throw new TxtBlockReaderError(
        'TXT_SOURCE_CHANGED',
        'The TXT source size no longer matches its metadata.',
      );
    }
    const manifest = await this.options.indexStore.loadValid(book);
    if (manifest === undefined) {
      throw new TxtBlockReaderError(
        'TXT_INDEX_INVALID',
        'The TXT index is missing or no longer matches the book.',
      );
    }
    return manifest;
  }

  async readBlocks(
    bookId: string,
    anchor: TxtLocator,
    direction: 'before' | 'after',
    limit: number,
  ): Promise<ReaderBlockBatch> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_READER_BLOCKS
    ) {
      throw new TxtBlockReaderError(
        'READER_LIMIT_INVALID',
        'The reader block limit is outside the supported range.',
      );
    }
    if (
      anchor.kind !== 'txt' ||
      typeof anchor.blockId !== 'string' ||
      anchor.blockId.length === 0 ||
      !Number.isSafeInteger(anchor.characterOffset) ||
      anchor.characterOffset < 0 ||
      typeof anchor.contentFingerprint !== 'string' ||
      anchor.contentFingerprint.length === 0
    ) {
      throw new TxtBlockReaderError(
        'TXT_LOCATOR_INVALID',
        'The TXT reading anchor is invalid.',
      );
    }

    const manifest = await this.loadIndex(bookId);
    if (manifest.blocks.length === 0) {
      return { blocks: [], atStart: true, atEnd: true };
    }
    const anchorIndex = manifest.blocks.findIndex(
      (entry) => entry.blockId === anchor.blockId,
    );
    if (anchorIndex < 0) {
      throw new TxtBlockReaderError(
        'TXT_LOCATOR_INVALID',
        'The TXT reading anchor is not present in the current index.',
      );
    }
    const anchorEntry = manifest.blocks[anchorIndex]!;
    if (anchorEntry.contentFingerprint !== anchor.contentFingerprint) {
      throw new TxtBlockReaderError(
        'TXT_LOCATOR_STALE',
        'The TXT reading anchor belongs to an older block revision.',
      );
    }

    const selectedIndices: number[] = [];
    if (direction === 'after') {
      for (
        let index = anchorIndex + 1;
        index < manifest.blocks.length && selectedIndices.length < limit;
        index += 1
      ) {
        selectedIndices.push(index);
      }
    } else {
      for (
        let index = anchorIndex - 1;
        index >= 0 && selectedIndices.length < limit;
        index -= 1
      ) {
        selectedIndices.unshift(index);
      }
    }

    const blocks: ReaderBlock[] = [];
    for (const index of selectedIndices) {
      const entry = manifest.blocks[index]!;
      const block = await this.readEntry(bookId, entry);
      const candidate = [...blocks, block];
      if (!this.fitsBatch(candidate)) {
        if (blocks.length === 0) {
          throw new TxtBlockReaderError(
            'TXT_BLOCK_TOO_LARGE',
            'A TXT block is too large for one protocol response.',
          );
        }
        break;
      }
      blocks.push(block);
    }

    const firstIndex =
      blocks.length === 0
        ? anchorIndex
        : manifest.blocks.findIndex((entry) => entry.blockId === blocks[0]!.id);
    const lastIndex =
      blocks.length === 0
        ? anchorIndex
        : manifest.blocks.findIndex(
            (entry) => entry.blockId === blocks.at(-1)!.id,
          );
    return {
      blocks,
      atStart:
        direction === 'before'
          ? firstIndex <= 0
          : anchorIndex === 0 && blocks.length === 0,
      atEnd:
        direction === 'after'
          ? lastIndex >= manifest.blocks.length - 1
          : anchorIndex === manifest.blocks.length - 1 && blocks.length === 0,
    };
  }

  private fitsBatch(blocks: readonly ReaderBlock[]): boolean {
    return (
      serializedUtf8Size({ blocks, atStart: false, atEnd: false }) <=
      this.maxBatchBytes
    );
  }

  private async readEntry(
    bookId: string,
    entry: TxtIndexEntry,
  ): Promise<ReaderBlock> {
    const book = await this.options.bookProvider(bookId);
    if (book === undefined) {
      throw new TxtBlockReaderError('BOOK_NOT_FOUND', 'Book was not found.');
    }
    const path = sourcePath(book.uri);
    let sourceStat;
    try {
      sourceStat = await stat(path);
    } catch (error) {
      throw new TxtBlockReaderError(
        'BOOK_SOURCE_MISSING',
        'The selected book source is unavailable.',
        { cause: error },
      );
    }
    if (!sourceStat.isFile()) {
      throw new TxtBlockReaderError(
        'BOOK_SOURCE_MISSING',
        'The selected book source is not a regular file.',
      );
    }
    const key = cacheKey(book, entry);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      if (
        cached.size === sourceStat.size &&
        cached.modifiedAt === sourceStat.mtimeMs
      ) {
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached.block;
      }
      this.cache.delete(key);
    }

    const length = entry.byteEnd - entry.byteStart;
    if (!isPositiveInteger(length)) {
      throw new TxtBlockReaderError(
        'TXT_INDEX_INVALID',
        'The TXT index contains an empty or invalid byte range.',
      );
    }
    let handle;
    try {
      handle = await open(path, 'r');
    } catch (error) {
      throw new TxtBlockReaderError(
        'BOOK_SOURCE_MISSING',
        'The selected book source is unavailable.',
        { cause: error },
      );
    }

    const decoder = iconv.getDecoder(book.encoding!);
    const hash = createHash('sha256');
    const paragraphs: string[] = [];
    let paragraph = '';
    let hashBuffer = '';
    let decodedLength = 0;
    let paragraphCount = 0;
    let lastEndedWithCr = false;
    let offset = 0;

    const addToHash = (text: string): void => {
      hashBuffer += text;
      if (hashBuffer.length >= 4_096) {
        hash.update(hashBuffer, 'utf8');
        hashBuffer = '';
      }
    };

    const finishParagraph = (): void => {
      paragraphs.push(paragraph);
      paragraph = '';
      paragraphCount += 1;
    };

    const consumeText = (text: string): void => {
      for (const character of text) {
        if (character === '\r') {
          addToHash('\n');
          decodedLength += 1;
          finishParagraph();
          lastEndedWithCr = true;
          continue;
        }
        if (character === '\n') {
          if (lastEndedWithCr) {
            lastEndedWithCr = false;
          } else {
            addToHash('\n');
            decodedLength += 1;
            finishParagraph();
          }
          continue;
        }
        lastEndedWithCr = false;
        paragraph += character;
        if (paragraph.length > MAX_PARAGRAPH_CHARACTERS) {
          throw new TxtBlockReaderError(
            'TXT_BLOCK_TOO_LARGE',
            'A TXT paragraph is too large for bounded reader memory.',
          );
        }
        addToHash(character);
        decodedLength += 1;
      }
    };

    try {
      while (offset < length) {
        const size = Math.min(RANGE_READ_BYTES, length - offset);
        const buffer = Buffer.allocUnsafe(size);
        const result = await handle.read(
          buffer,
          0,
          size,
          entry.byteStart + offset,
        );
        if (result.bytesRead === 0) {
          throw new TxtBlockReaderError(
            'TXT_SOURCE_CHANGED',
            'The TXT source changed while it was being read.',
          );
        }
        offset += result.bytesRead;
        consumeText(decoder.write(buffer.subarray(0, result.bytesRead)));
      }
      consumeText(decoder.end() ?? '');
      const finalStat = await handle.stat();
      if (
        finalStat.size !== sourceStat.size ||
        finalStat.mtimeMs !== sourceStat.mtimeMs
      ) {
        throw new TxtBlockReaderError(
          'TXT_SOURCE_CHANGED',
          'The TXT source changed while it was being read.',
        );
      }
      if (paragraph.length > 0) finishParagraph();
      if (hashBuffer.length > 0) hash.update(hashBuffer, 'utf8');
      const fingerprint = hash.digest('hex');
      if (
        decodedLength !== entry.decodedLength ||
        paragraphCount !== entry.paragraphCount ||
        fingerprint !== entry.contentFingerprint
      ) {
        throw new TxtBlockReaderError(
          'TXT_SOURCE_CHANGED',
          'The TXT source no longer matches its index.',
        );
      }
      const block: ReaderBlock = {
        id: entry.blockId,
        paragraphs,
        decodedLength,
        contentFingerprint: fingerprint,
      };
      this.cache.set(key, {
        block,
        size: sourceStat.size,
        modifiedAt: sourceStat.mtimeMs,
      });
      while (this.cache.size > this.maxCacheEntries) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      return block;
    } catch (error) {
      if (error instanceof TxtBlockReaderError) throw error;
      throw new TxtBlockReaderError(
        'TXT_DECODE_FAILED',
        'The TXT block could not be decoded safely.',
        { cause: error },
      );
    } finally {
      await handle.close().catch(() => undefined);
    }
  }
}
