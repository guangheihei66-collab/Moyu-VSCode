export type BookType = 'txt' | 'epub';

export interface BookMetadata {
  id: string;
  title: string;
  uri: string;
  type: BookType;
  encoding?: string;
  fingerprint: string;
  size: number;
  modifiedAt: number;
  addedAt: number;
  lastOpenedAt?: number;
  metadataVersion: number;
  [key: string]: unknown;
}

export interface BookTombstone {
  bookId: string;
  removedAt: number;
  version: number;
}

export type BookUri =
  | string
  | { toString(skipEncoding?: boolean): string; fsPath?: string };
