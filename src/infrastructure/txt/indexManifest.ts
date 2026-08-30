import type { BookMetadata } from '../../domain/books/types';
import {
  TXT_INDEX_SCHEMA_VERSION,
  type TxtIndexManifest,
} from '../../domain/reader/txtIndex';

const TXT_ENCODINGS = ['utf8', 'utf16le', 'utf16be', 'gb18030', 'gbk'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTxtEncoding(value: unknown): value is TxtIndexManifest['encoding'] {
  return (
    typeof value === 'string' &&
    (TXT_ENCODINGS as readonly string[]).includes(value)
  );
}

export function createIndexManifest(
  book: BookMetadata,
  blocks: TxtIndexManifest['blocks'],
): TxtIndexManifest {
  if (book.type !== 'txt' || book.encoding === undefined) {
    throw new Error('A confirmed TXT encoding is required before indexing.');
  }
  return {
    schemaVersion: TXT_INDEX_SCHEMA_VERSION,
    bookId: book.id,
    uri: book.uri,
    size: book.size,
    modifiedAt: book.modifiedAt,
    fingerprint: book.fingerprint,
    encoding: book.encoding,
    blocks,
  };
}

export function isTxtIndexManifest(value: unknown): value is TxtIndexManifest {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== TXT_INDEX_SCHEMA_VERSION ||
    typeof value.bookId !== 'string' ||
    value.bookId.length === 0 ||
    typeof value.uri !== 'string' ||
    value.uri.length === 0 ||
    !Number.isSafeInteger(value.size) ||
    (value.size as number) < 0 ||
    !Number.isFinite(value.modifiedAt) ||
    typeof value.fingerprint !== 'string' ||
    !isTxtEncoding(value.encoding) ||
    !Array.isArray(value.blocks)
  ) {
    return false;
  }

  let previousEnd = 0;
  const blockIds = new Set<string>();
  for (const block of value.blocks) {
    if (!isRecord(block)) return false;
    if (
      typeof block.blockId !== 'string' ||
      block.blockId.length === 0 ||
      blockIds.has(block.blockId) ||
      !Number.isSafeInteger(block.byteStart) ||
      !Number.isSafeInteger(block.byteEnd) ||
      (block.byteStart as number) < previousEnd ||
      (block.byteStart as number) < 0 ||
      (block.byteEnd as number) <= (block.byteStart as number) ||
      (block.byteEnd as number) > (value.size as number) ||
      !Number.isSafeInteger(block.decodedLength) ||
      (block.decodedLength as number) < 0 ||
      !Number.isSafeInteger(block.paragraphCount) ||
      (block.paragraphCount as number) < 0 ||
      typeof block.contentFingerprint !== 'string' ||
      block.contentFingerprint.length === 0
    ) {
      return false;
    }
    blockIds.add(block.blockId);
    previousEnd = block.byteEnd as number;
  }

  return true;
}
