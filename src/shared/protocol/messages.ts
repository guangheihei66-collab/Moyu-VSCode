import type {
  EpubLocator,
  ReaderBlockBatch,
  TxtLocator,
} from '../../domain/reader/locator';
import type { Game2048State as DurableGame2048State } from '../../domain/game2048/types';
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

export type AppSection = 'home' | 'books' | 'reader' | 'game2048' | 'settings';

export type SidebarSection = 'home' | 'books' | 'game2048' | 'settings';

export interface SidebarViewModel {
  active: SidebarSection;
  booksCount: number;
  bestScore: number;
}

export type SidebarMessage = {
  type: 'navigate';
  section: SidebarSection;
};

export type SidebarHostMessage = {
  type: 'state';
  model: SidebarViewModel;
};

export interface PresentationBook {
  bookId: string;
  title: string;
  type: 'txt' | 'epub';
  percentage: number;
  lastOpenedAt?: number;
  sourceMissing: boolean;
  chapterLabel?: string;
}

export interface HomeSnapshot {
  continueReading?: PresentationBook;
  recentBooks: readonly PresentationBook[];
  booksCount: number;
  bestScore: number;
  hasGameSession: boolean;
}

export interface BookshelfSnapshot {
  version: number;
  books: readonly PresentationBook[];
}

export interface Envelope<Type extends string, Payload> {
  protocol: typeof PROTOCOL_VERSION;
  id: string;
  sessionId: string;
  type: Type;
  payload: Payload;
}

export type LogicalLocator = TxtLocator | EpubLocator;

export type Game2048State = DurableGame2048State;

export type GameDirection = 'left' | 'right' | 'up' | 'down';

export type HostRequest =
  | Envelope<'app/ready', Record<string, never>>
  | Envelope<'home/read', Record<string, never>>
  | Envelope<'boss/ack', { requestId: string; mode: BossMode }>
  | Envelope<'app/navigate', { section: AppSection }>
  | Envelope<'books/list', Record<string, never>>
  | Envelope<'books/import', { uri?: string }>
  | Envelope<'books/remove', { bookId: string }>
  | Envelope<'books/relocate', { bookId: string; uri?: string }>
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

export interface ReaderOpenSnapshot {
  bookId: string;
  version: number;
  anchor: LogicalLocator | null;
}

export interface ReaderProgressSnapshot {
  version: number;
  locator: LogicalLocator;
}

export interface Game2048SessionSnapshot {
  version: number;
  state: Game2048State;
}

export type HostResponse =
  | Envelope<'response/success', { requestId: string }>
  | Envelope<'home/snapshot', { requestId: string; snapshot: HomeSnapshot }>
  | Envelope<
      'books/snapshot',
      { requestId: string; snapshot: BookshelfSnapshot }
    >
  | Envelope<
      'settings/snapshot',
      { requestId: string; snapshot: ReaderSettingsSnapshot }
    >
  | Envelope<
      'reader/opened',
      { requestId: string; snapshot: ReaderOpenSnapshot }
    >
  | Envelope<'reader/blocks', { requestId: string; batch: ReaderBlockBatch }>
  | Envelope<
      'reader/progressSaved',
      { requestId: string; snapshot: ReaderProgressSnapshot }
    >
  | Envelope<
      'game2048/session',
      { requestId: string; session: Game2048SessionSnapshot | null }
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
