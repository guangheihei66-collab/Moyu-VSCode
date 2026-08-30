import type { VersionedEnvelope } from '../../domain/persistence/envelope';

export interface BookRecord {
  id: string;
  title: string;
  uri: string;
  type: 'txt' | 'epub';
  encoding?: string;
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

export interface BookshelfData {
  books: BookRecord[];
  tombstones: BookTombstone[];
}

export type BookshelfOperation =
  | { kind: 'add'; book: BookRecord }
  | { kind: 'remove'; bookId: string; removedAt?: number }
  | { kind: 'touch'; bookId: string; lastOpenedAt: number }
  | { kind: 'setEncoding'; bookId: string; encoding: string }
  | {
      kind: 'relocate';
      bookId: string;
      uri: string;
      fingerprint?: string;
      size?: number;
      modifiedAt?: number;
    };

export interface ReadingCheckpoint {
  locator: unknown;
  percentage: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface ProgressData {
  byBookId: Record<string, ReadingCheckpoint>;
  versions: Record<string, number>;
}

export interface PersistedGameState {
  gameSessionId: string;
  board: readonly (readonly number[])[];
  score: number;
  bestScore: number;
  moveSequence: number;
  status?: 'playing' | 'won' | 'lost';
  [key: string]: unknown;
}

export interface GameData {
  activeSessionId: string;
  state: PersistedGameState;
}

export interface PreferencesData {
  [key: string]: unknown;
}

export interface Repository<T> {
  read(): Promise<VersionedEnvelope<T> | undefined>;
}
