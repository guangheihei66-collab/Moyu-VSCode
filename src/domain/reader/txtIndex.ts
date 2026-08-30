import type { BookMetadata } from '../books/types';

export const TXT_INDEX_SCHEMA_VERSION = 1;

export interface TxtIndexEntry {
  blockId: string;
  byteStart: number;
  byteEnd: number;
  decodedLength: number;
  paragraphCount: number;
  contentFingerprint: string;
}

export interface TxtIndexManifest {
  schemaVersion: number;
  bookId: string;
  uri: string;
  size: number;
  modifiedAt: number;
  fingerprint: string;
  encoding: NonNullable<BookMetadata['encoding']>;
  blocks: readonly TxtIndexEntry[];
}
