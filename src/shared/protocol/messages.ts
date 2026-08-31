import type { EpubLocator, TxtLocator } from '../../domain/reader/locator';
import type {
  BossTemplate,
  ReaderSettingsPatch,
  ReaderSettingsSnapshot,
} from '../../domain/reader/settings';
import type { BossMode } from '../../domain/boss/types';

export type {
  EpubLocator,
  ReaderBlock,
  ReaderBlockBatch,
  TxtLocator,
} from '../../domain/reader/locator';

export const PROTOCOL_VERSION = 1 as const;

export type AppSection = 'books' | 'reader' | 'game2048' | 'settings';

export interface Envelope<Type extends string, Payload> {
  protocol: typeof PROTOCOL_VERSION;
  id: string;
  sessionId: string;
  type: Type;
  payload: Payload;
}

export type LogicalLocator = TxtLocator | EpubLocator;

export interface Game2048State {
  board: readonly (readonly number[])[];
  score: number;
  status: 'playing' | 'won' | 'lost';
}

export type GameDirection = 'left' | 'right' | 'up' | 'down';

export type HostRequest =
  | Envelope<'app/ready', Record<string, never>>
  | Envelope<'boss/ack', { requestId: string; mode: BossMode }>
  | Envelope<'app/navigate', { section: AppSection }>
  | Envelope<'books/list', Record<string, never>>
  | Envelope<'books/import', { uri: string }>
  | Envelope<'books/remove', { bookId: string }>
  | Envelope<'books/relocate', { bookId: string; uri: string }>
  | Envelope<'books/selectEncoding', { bookId: string }>
  | Envelope<'reader/open', { bookId: string }>
  | Envelope<'settings/read', Record<string, never>>
  | Envelope<
      'settings/update',
      { baseVersion: number; patch: ReaderSettingsPatch }
    >
  | Envelope<
      'reader/readBlocks',
      {
        bookId: string;
        anchor: LogicalLocator;
        direction: 'before' | 'after';
        limit: number;
      }
    >
  | Envelope<
      'reader/saveProgress',
      { bookId: string; baseVersion: number; locator: LogicalLocator }
    >
  | Envelope<'game2048/load', Record<string, never>>
  | Envelope<'game2048/newGame', { baseVersion: number }>
  | Envelope<
      'game2048/move',
      {
        baseVersion: number;
        sessionId: string;
        moveSequence: number;
        direction: GameDirection;
      }
    >
  | Envelope<'game2048/save', { baseVersion: number; state: Game2048State }>;

export type ProtocolErrorCode =
  | 'INVALID_MESSAGE'
  | 'MESSAGE_TOO_LARGE'
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_PROTOCOL'
  | 'INVALID_SESSION'
  | 'STALE_SESSION'
  | 'UNKNOWN_REQUEST_TYPE'
  | 'UNKNOWN_RESPONSE_TYPE'
  | 'UNKNOWN_EVENT_TYPE'
  | 'INVALID_PAYLOAD';

export interface ProtocolError {
  code: ProtocolErrorCode;
  message: string;
}

export type HostResponse =
  | Envelope<'response/success', { requestId: string }>
  | Envelope<
      'settings/snapshot',
      { requestId: string; snapshot: ReaderSettingsSnapshot }
    >
  | Envelope<'response/error', { requestId: string; error: ProtocolError }>;

export type HostEvent =
  | Envelope<'app/error', { error: ProtocolError }>
  | Envelope<'app/notice', { message: string }>
  | Envelope<'app/navigate', { section: AppSection }>
  | Envelope<
      'boss/modeChanged',
      { requestId: string; mode: BossMode; template: BossTemplate }
    >;
