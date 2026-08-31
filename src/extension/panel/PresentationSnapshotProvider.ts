import type { VersionedEnvelope } from '../../domain/persistence/envelope';
import type {
  BookshelfData,
  ProgressData,
} from '../../application/persistence/repositories';
import type { FileStatProvider } from '../../infrastructure/filesystem/fileIdentity';
import type { VersionedGameState } from '../../application/game2048/Game2048Service';
import type {
  BookshelfSnapshot,
  HomeSnapshot,
  PresentationBook,
} from '../../shared/protocol/messages';

export interface PresentationBookshelfReader {
  list(): Promise<VersionedEnvelope<BookshelfData> | undefined>;
}

export interface PresentationProgressReader {
  read(): Promise<VersionedEnvelope<ProgressData> | undefined>;
}

export interface PresentationGameReader {
  load(): Promise<VersionedGameState | undefined>;
}

export interface PresentationSnapshotDependencies {
  bookshelf: PresentationBookshelfReader;
  progress: PresentationProgressReader;
  game: PresentationGameReader;
  fileStats: FileStatProvider;
}

interface ProgressCheckpoint {
  percentage: number;
  locator: unknown;
}

export interface PresentationSnapshotReader {
  readHome(): Promise<HomeSnapshot>;
  readBooks(): Promise<BookshelfSnapshot>;
}

export class PresentationSnapshotProvider
  implements PresentationSnapshotReader
{
  constructor(
    private readonly dependencies: PresentationSnapshotDependencies,
  ) {}

  async readHome(): Promise<HomeSnapshot> {
    const [bookshelf, progress, game] = await Promise.all([
      this.dependencies.bookshelf.list(),
      this.dependencies.progress.read(),
      this.dependencies.game.load(),
    ]);
    const books = await this.projectBooks(
      bookshelf?.data.books ?? [],
      progress?.data.byBookId ?? {},
    );
    const continueReading = books.find(
      (book) => book.percentage > 0 && book.sourceMissing === false,
    );
    return {
      ...(continueReading === undefined
        ? {}
        : { continueReading: { ...continueReading } }),
      recentBooks: books.slice(0, 8),
      booksCount: books.length,
      bestScore: game?.data.state.bestScore ?? 0,
      hasGameSession: game !== undefined,
    };
  }

  async readBooks(): Promise<BookshelfSnapshot> {
    const [bookshelf, progress] = await Promise.all([
      this.dependencies.bookshelf.list(),
      this.dependencies.progress.read(),
    ]);
    return {
      version: bookshelf?.version ?? 0,
      books: await this.projectBooks(
        bookshelf?.data.books ?? [],
        progress?.data.byBookId ?? {},
      ),
    };
  }

  private async projectBooks(
    books: readonly BookshelfData['books'][number][],
    checkpoints: Readonly<Record<string, ProgressCheckpoint>>,
  ): Promise<PresentationBook[]> {
    const projected = await Promise.all(
      books.map(async (book) => {
        const checkpoint = checkpoints[book.id];
        return {
          book: await this.projectBook(book, checkpoint),
          sortAt: book.lastOpenedAt ?? book.addedAt,
        };
      }),
    );
    return projected
      .sort((left, right) => right.sortAt - left.sortAt)
      .map(({ book }) => book);
  }

  private async projectBook(
    book: BookshelfData['books'][number],
    checkpoint: ProgressCheckpoint | undefined,
  ): Promise<PresentationBook> {
    let sourceMissing = false;
    try {
      await this.dependencies.fileStats.stat(book.uri);
    } catch {
      sourceMissing = true;
    }
    const percentage =
      checkpoint !== undefined &&
      Number.isFinite(checkpoint.percentage) &&
      checkpoint.percentage >= 0
        ? Math.min(100, Math.round(checkpoint.percentage * 100))
        : 0;
    const chapterLabel = chapterLabelFromLocator(checkpoint?.locator);
    return {
      bookId: book.id,
      title: book.title,
      type: book.type,
      percentage,
      ...(book.lastOpenedAt === undefined
        ? {}
        : { lastOpenedAt: book.lastOpenedAt }),
      sourceMissing,
      ...(chapterLabel === undefined ? {} : { chapterLabel }),
    };
  }
}

function chapterLabelFromLocator(locator: unknown): string | undefined {
  if (typeof locator !== 'object' || locator === null) return undefined;
  const candidate = locator as { kind?: unknown; chapterId?: unknown };
  return candidate.kind === 'epub' && typeof candidate.chapterId === 'string'
    ? candidate.chapterId
    : undefined;
}
