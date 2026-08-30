export type BookType = 'txt' | 'epub';
export type TxtEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'gb18030' | 'gbk';

export interface BookMetadata {
  id: string;
  title: string;
  uri: string;
  type: BookType;
  encoding?: TxtEncoding;
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
