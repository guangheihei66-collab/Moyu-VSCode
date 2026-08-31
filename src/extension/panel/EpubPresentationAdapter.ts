import { fileURLToPath } from 'node:url';

import type { BookMetadata } from '../../domain/books/types';
import type { EpubBookIndex } from '../../domain/reader/epub';
import { isEpubLocator, type EpubLocator } from '../../domain/reader/locator';
import type { VersionedEnvelope } from '../../domain/persistence/envelope';
import type { ProgressData } from '../../application/persistence/repositories';
import type {
  EpubChapterListSnapshot,
  EpubChapterSnapshot,
  EpubChapterSummary,
  LogicalLocator,
  ReaderOpenSnapshot,
  ReaderProgressSnapshot,
} from '../../shared/protocol/messages';
import type { EpubCache } from '../../infrastructure/epub/EpubCache';
import type { EpubParser } from '../../infrastructure/epub/EpubParser';
import type {
  EpubReaderService,
  OpenedEpubChapter,
} from '../../application/reader/EpubReaderService';

interface ProgressReader {
  read(): Promise<VersionedEnvelope<ProgressData> | undefined>;
}

interface EpubReaderOperations {
  openChapter(bookId: string, chapterId: string): Promise<OpenedEpubChapter>;
  nextChapter(bookId: string, chapterId: string): Promise<OpenedEpubChapter>;
  previousChapter(
    bookId: string,
    chapterId: string,
  ): Promise<OpenedEpubChapter>;
  saveProgress(
    bookId: string,
    baseVersion: number,
    locator: EpubLocator,
  ): Promise<VersionedEnvelope<ProgressData>>;
  restore(bookId: string): Promise<EpubLocator | undefined>;
}

export interface EpubPresentationAdapterOptions {
  reader: Pick<EpubReaderService, keyof EpubReaderOperations>;
  parser: Pick<EpubParser, 'parse'>;
  cache: Pick<EpubCache, 'load' | 'save'>;
  progress: ProgressReader;
  bookProvider: (bookId: string) => Promise<BookMetadata | undefined>;
}

export class EpubPresentationAdapter {
  private readonly reader: EpubReaderOperations;

  constructor(private readonly options: EpubPresentationAdapterOptions) {
    this.reader = options.reader;
  }

  async open(bookId: string): Promise<ReaderOpenSnapshot> {
    const book = await this.requireBook(bookId);
    const [progress, locator, index] = await Promise.all([
      this.options.progress.read(),
      this.reader.restore(bookId),
      this.loadIndex(book),
    ]);
    const checkpoint = progress?.data.byBookId[bookId];
    const chapter =
      locator === undefined
        ? undefined
        : index.chapters.find(
            (candidate) => candidate.id === locator.chapterId,
          );
    return {
      bookId,
      version: progress?.version ?? 0,
      anchor: locator ?? null,
      title: book.title,
      type: 'epub',
      percentage: percentage(checkpoint?.percentage),
      ...(chapter === undefined ? {} : { chapterTitle: chapter.title }),
    };
  }

  async listChapters(bookId: string): Promise<EpubChapterListSnapshot> {
    const index = await this.loadIndexForBook(bookId);
    return {
      bookId,
      chapters: index.chapters.map((chapter, position) =>
        this.chapterSummary(chapter.id, chapter.title, position),
      ),
    };
  }

  async openChapter(
    bookId: string,
    chapterId: string,
  ): Promise<EpubChapterSnapshot> {
    const [index, chapter] = await Promise.all([
      this.loadIndexForBook(bookId),
      this.reader.openChapter(bookId, chapterId),
    ]);
    return this.chapterSnapshot(bookId, index, chapter);
  }

  async navigateChapter(
    bookId: string,
    chapterId: string,
    direction: 'previous' | 'next',
  ): Promise<EpubChapterSnapshot> {
    const chapter =
      direction === 'previous'
        ? await this.reader.previousChapter(bookId, chapterId)
        : await this.reader.nextChapter(bookId, chapterId);
    const index = await this.loadIndexForBook(bookId);
    return this.chapterSnapshot(bookId, index, chapter);
  }

  async saveProgress(
    bookId: string,
    baseVersion: number,
    locator: LogicalLocator,
  ): Promise<ReaderProgressSnapshot> {
    if (!isEpubLocator(locator)) {
      throw new Error('The EPUB reading locator is invalid.');
    }
    const saved = await this.reader.saveProgress(bookId, baseVersion, locator);
    const checkpoint = saved.data.byBookId[bookId];
    if (checkpoint === undefined || !isEpubLocator(checkpoint.locator)) {
      throw new Error('The EPUB progress response is invalid.');
    }
    return { version: saved.version, locator: checkpoint.locator };
  }

  private async chapterSnapshot(
    bookId: string,
    index: EpubBookIndex,
    chapter: OpenedEpubChapter,
  ): Promise<EpubChapterSnapshot> {
    const position = index.chapters.findIndex(
      (candidate) => candidate.id === chapter.chapterId,
    );
    if (position < 0) throw new Error('EPUB chapter was not found.');
    return {
      bookId,
      chapterId: chapter.chapterId,
      title: chapter.title,
      position,
      contentFingerprint: chapter.contentFingerprint,
      paragraphs: [...chapter.paragraphs],
    };
  }

  private chapterSummary(
    chapterId: string,
    title: string,
    position: number,
  ): EpubChapterSummary {
    return { chapterId, title, position };
  }

  private async loadIndexForBook(bookId: string): Promise<EpubBookIndex> {
    return this.loadIndex(await this.requireBook(bookId));
  }

  private async loadIndex(book: BookMetadata): Promise<EpubBookIndex> {
    const cached = await this.options.cache.load(book);
    if (cached !== undefined) return cached;
    const fsPath = book.uri.startsWith('file:')
      ? fileURLToPath(book.uri)
      : book.uri;
    const index = await this.options.parser.parse({ fsPath });
    await this.options.cache.save(book, index);
    return index;
  }

  private async requireBook(bookId: string): Promise<BookMetadata> {
    const book = await this.options.bookProvider(bookId);
    if (book === undefined || book.type !== 'epub') {
      throw new Error('EPUB book was not found.');
    }
    return book;
  }
}

function percentage(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100)));
}
