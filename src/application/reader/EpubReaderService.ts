import { fileURLToPath } from 'node:url';
import type { VersionedEnvelope } from '../../domain/persistence/envelope';
import type { BookMetadata } from '../../domain/books/types';
import type { EpubBookIndex, EpubChapter } from '../../domain/reader/epub';
import { isEpubLocator, type EpubLocator } from '../../domain/reader/locator';
import type {
  ProgressData,
  ReadingCheckpoint,
} from '../persistence/repositories';
import type { EpubCache } from '../../infrastructure/epub/EpubCache';
import type { EpubParser } from '../../infrastructure/epub/EpubParser';

interface ProgressStore {
  read(): Promise<VersionedEnvelope<ProgressData> | undefined>;
  save(
    bookId: string,
    baseVersion: number,
    checkpoint: ReadingCheckpoint,
  ): Promise<VersionedEnvelope<ProgressData>>;
}
interface Options {
  parser: EpubParser;
  cache: EpubCache;
  progress: ProgressStore;
  bookProvider: (bookId: string) => Promise<BookMetadata | undefined>;
  clock?: () => number;
}

export interface OpenedEpubChapter {
  chapterId: string;
  title: string;
  paragraphs: string[];
  contentFingerprint: string;
}

export class EpubReaderService {
  private readonly clock: () => number;
  constructor(private readonly options: Options) {
    this.clock = options.clock ?? Date.now;
  }
  async openChapter(
    bookId: string,
    chapterId: string,
  ): Promise<OpenedEpubChapter> {
    const index = await this.index(bookId);
    const chapter = index.chapters.find((item) => item.id === chapterId);
    if (chapter === undefined) throw new Error('EPUB chapter was not found.');
    return opened(chapter);
  }
  async nextChapter(
    bookId: string,
    chapterId: string,
  ): Promise<OpenedEpubChapter> {
    return this.adjacent(bookId, chapterId, 1);
  }
  async previousChapter(
    bookId: string,
    chapterId: string,
  ): Promise<OpenedEpubChapter> {
    return this.adjacent(bookId, chapterId, -1);
  }
  async saveProgress(
    bookId: string,
    baseVersion: number,
    locator: EpubLocator,
  ): Promise<VersionedEnvelope<ProgressData>> {
    const index = await this.index(bookId);
    const recovered = recover(locator, index);
    if (recovered === undefined)
      throw new Error('The EPUB reading locator is invalid.');
    const chapterIndex = index.chapters.findIndex(
      (item) => item.id === recovered.chapterId,
    );
    return this.options.progress.save(bookId, baseVersion, {
      locator: recovered,
      percentage:
        index.chapters.length === 0 ? 0 : chapterIndex / index.chapters.length,
      updatedAt: this.clock(),
    });
  }
  async restore(bookId: string): Promise<EpubLocator | undefined> {
    const checkpoint = (await this.options.progress.read())?.data.byBookId[
      bookId
    ];
    if (checkpoint === undefined || !isEpubLocator(checkpoint.locator))
      return undefined;
    return recover(checkpoint.locator, await this.index(bookId));
  }
  private async adjacent(
    bookId: string,
    chapterId: string,
    delta: number,
  ): Promise<OpenedEpubChapter> {
    const index = await this.index(bookId);
    const position = index.chapters.findIndex((item) => item.id === chapterId);
    const chapter = index.chapters[position + delta];
    if (position < 0 || chapter === undefined)
      throw new Error('No adjacent EPUB chapter.');
    return opened(chapter);
  }
  private async index(bookId: string): Promise<EpubBookIndex> {
    const book = await this.options.bookProvider(bookId);
    if (book === undefined || book.type !== 'epub')
      throw new Error('EPUB book was not found.');
    const cached = await this.options.cache.load(book);
    if (cached !== undefined) return cached;
    const fsPath = book.uri.startsWith('file:')
      ? fileURLToPath(book.uri)
      : book.uri;
    const index = await this.options.parser.parse({ fsPath });
    await this.options.cache.save(book, index);
    return index;
  }
}

function opened(chapter: EpubChapter): OpenedEpubChapter {
  return {
    chapterId: chapter.id,
    title: chapter.title,
    paragraphs: chapter.paragraphs,
    contentFingerprint: chapter.contentFingerprint,
  };
}

function recover(
  locator: EpubLocator,
  index: EpubBookIndex,
): EpubLocator | undefined {
  if (!isEpubLocator(locator)) return undefined;
  const chapter = index.chapters.find(
    (item) =>
      item.id === locator.chapterId &&
      item.contentFingerprint === locator.contentFingerprint,
  );
  if (chapter === undefined || chapter.paragraphs.length === 0)
    return undefined;
  const paragraphIndex = Math.min(
    locator.paragraphIndex,
    chapter.paragraphs.length - 1,
  );
  return {
    ...locator,
    paragraphIndex,
    characterOffset: Math.min(
      locator.characterOffset,
      chapter.paragraphs[paragraphIndex]!.length,
    ),
  };
}
