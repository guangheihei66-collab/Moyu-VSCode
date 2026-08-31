import type {
  ReaderBlock,
  ReaderBlockBatch,
  EpubLocator,
} from '../../src/domain/reader/locator';
import type {
  EpubChapterListSnapshot,
  EpubChapterSnapshot,
  EpubChapterSummary,
  LogicalLocator,
} from '../../src/shared/protocol/messages';
import { BlockWindow } from './blockWindow';
import type { FocusAnchor } from './focusAnchor';
import { ReaderView, type ReaderViewActions } from './ReaderView';
import {
  createReaderPresentationModel,
  type ReaderDocumentType,
  type ReaderPresentationMetadata,
} from './readerModel';

export interface ReaderTransport {
  open(bookId: string): Promise<{
    version: number;
    anchor: LogicalLocator | null;
    title?: string;
    type?: ReaderDocumentType;
    percentage?: number;
    chapterTitle?: string;
  }>;
  readBlocks(
    bookId: string,
    anchor: LogicalLocator,
    direction: 'before' | 'after',
    limit: number,
  ): Promise<ReaderBlockBatch>;
  saveProgress(
    bookId: string,
    baseVersion: number,
    locator: LogicalLocator,
  ): Promise<{ version: number; locator: LogicalLocator }>;
  listChapters?(bookId: string): Promise<EpubChapterListSnapshot>;
  openChapter?(bookId: string, chapterId: string): Promise<EpubChapterSnapshot>;
  navigateChapter?(
    bookId: string,
    chapterId: string,
    direction: 'previous' | 'next',
  ): Promise<EpubChapterSnapshot>;
}

export class ReaderController {
  private readonly blockWindow = new BlockWindow();
  private readonly locatorsByBlockId = new Map<string, LogicalLocator>();
  private root: HTMLElement | undefined;
  private view: ReaderView | undefined;
  private bookId: string | undefined;
  private baseVersion = 0;
  private paused = false;
  private presentation: ReaderPresentationMetadata = {
    bookId: 'reader',
    title: 'Reader',
    type: 'txt',
    percentage: 0,
  };
  private atStart = true;
  private atEnd = true;
  private epubChapters: readonly EpubChapterSummary[] = [];
  private currentChapterId: string | undefined;

  constructor(private readonly transport: ReaderTransport) {}

  get isPaused(): boolean {
    return this.paused;
  }

  mount(root: HTMLElement, actions: ReaderViewActions = {}): void {
    const hasRenderedReader =
      root.querySelector<HTMLElement>('[data-reader-content]') !== null;
    this.root = root;
    this.view = new ReaderView(root, {
      ...actions,
      onAction: (action) => {
        if (action === 'chapters') void this.openChapterList();
        actions.onAction?.(action);
      },
      onPrevious:
        actions.onPrevious ?? (() => void this.previousPageOrChapter()),
      onNext: actions.onNext ?? (() => void this.nextPageOrChapter()),
    });
    this.view.setPaused(this.paused);
    if (!hasRenderedReader) this.render();
  }

  async open(bookId: string): Promise<void> {
    this.bookId = bookId;
    const opened = await this.transport.open(bookId);
    this.baseVersion = opened.version;
    this.presentation = {
      bookId,
      title: opened.title,
      type: opened.type,
      percentage: opened.percentage,
      chapterTitle: opened.chapterTitle,
    };
    this.locatorsByBlockId.clear();
    this.epubChapters = [];
    this.currentChapterId = undefined;
    if (opened.type === 'epub' || opened.anchor?.kind === 'epub') {
      await this.openEpubDocument(
        opened.anchor?.kind === 'epub' ? opened.anchor : undefined,
      );
      return;
    }
    if (opened.anchor === null) {
      this.blockWindow.replace([]);
      this.atStart = true;
      this.atEnd = true;
      this.render();
      return;
    }
    const batch = await this.transport.readBlocks(
      bookId,
      opened.anchor,
      'after',
      20,
    );
    this.blockWindow.replace(batch.blocks);
    this.atStart = batch.atStart;
    this.atEnd = batch.atEnd;
    this.rememberLocators(batch.blocks, opened.anchor);
    this.render();
  }

  async loadBefore(): Promise<void> {
    if (this.presentation.type === 'epub') {
      await this.navigateChapter('previous');
      return;
    }
    await this.load('before');
  }

  async loadAfter(): Promise<void> {
    if (this.presentation.type === 'epub') {
      await this.navigateChapter('next');
      return;
    }
    await this.load('after');
  }

  async saveAnchor(): Promise<void> {
    const locator = this.captureLogicalAnchor();
    if (locator === undefined || this.bookId === undefined) return;
    const saved = await this.transport.saveProgress(
      this.bookId,
      this.baseVersion,
      locator,
    );
    this.baseVersion = saved.version;
    this.locatorsByBlockId.set(this.blockIdFor(saved.locator), saved.locator);
  }

  pageUp(): void {
    this.pageBy(-1);
  }

  pageDown(): void {
    this.pageBy(1);
  }

  pause(): void {
    this.paused = true;
    this.view?.closeChapterDrawer();
    this.view?.setPaused(true);
  }

  resume(): void {
    this.paused = false;
    this.view?.setPaused(false);
  }

  captureAnchor(): FocusAnchor | undefined {
    return this.view?.captureFocus();
  }

  captureFocus(): FocusAnchor | undefined {
    return this.captureAnchor();
  }

  captureLogicalAnchor(): LogicalLocator | undefined {
    const focus = this.captureAnchor();
    if (focus === undefined) return undefined;
    const locator = this.locatorsByBlockId.get(focus.blockId);
    if (locator === undefined) return undefined;
    if (locator.kind === 'epub') {
      const paragraphIndex = focus.paragraphIndex ?? locator.paragraphIndex;
      const paragraphChanged = paragraphIndex !== locator.paragraphIndex;
      return {
        ...locator,
        paragraphIndex,
        characterOffset: paragraphChanged
          ? 0
          : focus.characterOffset === 0
            ? locator.characterOffset
            : focus.characterOffset,
      };
    }
    return {
      ...locator,
      characterOffset:
        focus.characterOffset === 0
          ? locator.characterOffset
          : focus.characterOffset,
    };
  }

  captureScroll(): number | undefined {
    return this.root?.scrollTop;
  }

  restoreScroll(scroll: number): void {
    if (this.root !== undefined && Number.isFinite(scroll)) {
      this.root.scrollTop = scroll;
    }
  }

  captureState(): object {
    return this.blockWindow;
  }

  restoreFocus(anchor: FocusAnchor): boolean {
    return this.view?.restoreFocus(anchor) ?? false;
  }

  restoreLogicalAnchor(locator: LogicalLocator): boolean {
    if (locator.kind === 'txt') {
      this.locatorsByBlockId.set(locator.blockId, locator);
      return this.restoreFocus({
        blockId: locator.blockId,
        characterOffset: locator.characterOffset,
      });
    }
    this.locatorsByBlockId.set(locator.chapterId, locator);
    this.currentChapterId = locator.chapterId;
    return this.restoreFocus({
      blockId: locator.chapterId,
      characterOffset: locator.characterOffset,
      paragraphIndex: locator.paragraphIndex,
    });
  }

  dispose(): void {
    this.view?.dispose();
    this.root = undefined;
    this.view = undefined;
    this.bookId = undefined;
    this.baseVersion = 0;
    this.presentation = {
      bookId: 'reader',
      title: 'Reader',
      type: 'txt',
      percentage: 0,
    };
    this.atStart = true;
    this.atEnd = true;
    this.epubChapters = [];
    this.currentChapterId = undefined;
    this.locatorsByBlockId.clear();
    this.blockWindow.replace([]);
  }

  private async openEpubDocument(
    retainedAnchor: EpubLocator | undefined,
  ): Promise<void> {
    const listChapters = this.transport.listChapters;
    const openChapter = this.transport.openChapter;
    if (
      this.bookId === undefined ||
      listChapters === undefined ||
      openChapter === undefined
    ) {
      this.blockWindow.replace([]);
      this.atStart = true;
      this.atEnd = true;
      this.render();
      return;
    }

    const list = await listChapters.call(this.transport, this.bookId);
    this.epubChapters = list.chapters;
    const chapterId = retainedAnchor?.chapterId ?? list.chapters[0]?.chapterId;
    if (chapterId === undefined) {
      this.blockWindow.replace([]);
      this.atStart = true;
      this.atEnd = true;
      this.render();
      return;
    }
    const chapter = await openChapter.call(
      this.transport,
      this.bookId,
      chapterId,
    );
    this.renderEpubChapter(
      chapter,
      retainedAnchor,
      this.presentation.percentage,
    );
  }

  private async openChapter(chapterId: string): Promise<void> {
    if (this.paused || this.bookId === undefined) return;
    const openChapter = this.transport.openChapter;
    if (openChapter === undefined) return;
    this.view?.closeChapterDrawer();
    const chapter = await openChapter.call(
      this.transport,
      this.bookId,
      chapterId,
    );
    this.renderEpubChapter(chapter);
  }

  private async navigateChapter(direction: 'previous' | 'next'): Promise<void> {
    if (
      this.paused ||
      this.bookId === undefined ||
      this.currentChapterId === undefined
    ) {
      return;
    }
    if (
      (direction === 'previous' && this.atStart) ||
      (direction === 'next' && this.atEnd)
    ) {
      return;
    }
    const navigateChapter = this.transport.navigateChapter;
    if (navigateChapter === undefined) return;
    const chapter = await navigateChapter.call(
      this.transport,
      this.bookId,
      this.currentChapterId,
      direction,
    );
    this.renderEpubChapter(chapter);
  }

  private async openChapterList(): Promise<void> {
    if (
      this.paused ||
      this.presentation.type !== 'epub' ||
      this.bookId === undefined
    ) {
      return;
    }
    const listChapters = this.transport.listChapters;
    if (listChapters === undefined) return;
    const list = await listChapters.call(this.transport, this.bookId);
    this.epubChapters = list.chapters;
    this.view?.openChapterDrawer(
      this.epubChapters,
      this.currentChapterId ?? '',
      (chapterId) => void this.openChapter(chapterId),
    );
  }

  private previousPageOrChapter(): void {
    if (this.presentation.type === 'epub')
      void this.navigateChapter('previous');
    else this.pageUp();
  }

  private nextPageOrChapter(): void {
    if (this.presentation.type === 'epub') void this.navigateChapter('next');
    else this.pageDown();
  }

  private renderEpubChapter(
    chapter: EpubChapterSnapshot,
    retainedAnchor?: EpubLocator,
    percentageOverride?: number,
  ): void {
    if (this.bookId === undefined) return;
    const block: ReaderBlock = {
      id: chapter.chapterId,
      paragraphs: chapter.paragraphs,
      decodedLength: chapter.paragraphs.reduce(
        (total, paragraph) => total + paragraph.length,
        0,
      ),
      contentFingerprint: chapter.contentFingerprint,
    };
    this.blockWindow.replace([block]);
    this.currentChapterId = chapter.chapterId;
    const locator =
      retainedAnchor?.chapterId === chapter.chapterId &&
      retainedAnchor.contentFingerprint === chapter.contentFingerprint
        ? retainedAnchor
        : this.defaultEpubLocator(chapter);
    this.locatorsByBlockId.delete(chapter.chapterId);
    if (locator !== undefined) {
      this.locatorsByBlockId.set(chapter.chapterId, locator);
    }
    this.presentation = {
      ...this.presentation,
      bookId: this.bookId,
      type: 'epub',
      percentage:
        percentageOverride ?? this.chapterPercentage(chapter.position),
      chapterTitle: chapter.title,
    };
    this.atStart = chapter.position <= 0;
    this.atEnd =
      this.epubChapters.length === 0 ||
      chapter.position >= this.epubChapters.length - 1;
    this.render();
  }

  private defaultEpubLocator(
    chapter: EpubChapterSnapshot,
  ): EpubLocator | undefined {
    if (chapter.paragraphs.length === 0) return undefined;
    return {
      kind: 'epub',
      chapterId: chapter.chapterId,
      paragraphIndex: 0,
      characterOffset: 0,
      contentFingerprint: chapter.contentFingerprint,
    };
  }

  private chapterPercentage(position: number): number {
    return this.epubChapters.length === 0
      ? 0
      : Math.round((Math.max(0, position) / this.epubChapters.length) * 100);
  }

  private async load(direction: 'before' | 'after'): Promise<void> {
    if (this.paused || this.bookId === undefined) return;
    const blocks = this.blockWindow.blocks;
    const block =
      direction === 'before' ? blocks[0] : blocks[blocks.length - 1];
    const anchor =
      block === undefined ? undefined : this.locatorsByBlockId.get(block.id);
    if (anchor === undefined) return;
    const batch = await this.transport.readBlocks(
      this.bookId,
      anchor,
      direction,
      20,
    );
    if (direction === 'before') this.blockWindow.prepend(batch.blocks);
    else this.blockWindow.append(batch.blocks);
    this.atStart = batch.atStart;
    this.atEnd = batch.atEnd;
    this.rememberLocators(batch.blocks);
    this.render();
  }

  private render(): void {
    this.view?.render(
      createReaderPresentationModel(
        this.presentation,
        this.blockWindow.blocks,
        this.atStart,
        this.atEnd,
      ),
      this.blockWindow.blocks,
    );
  }

  private pageBy(direction: -1 | 1): void {
    if (this.root === undefined) return;
    this.root.scrollTop += direction * this.root.clientHeight;
  }

  private rememberLocators(
    blocks: readonly ReaderBlock[],
    retainedAnchor?: LogicalLocator,
  ): void {
    for (const block of blocks) {
      const locator =
        retainedAnchor !== undefined &&
        this.blockIdFor(retainedAnchor) === block.id
          ? retainedAnchor
          : {
              kind: 'txt' as const,
              blockId: block.id,
              characterOffset: 0,
              contentFingerprint: block.contentFingerprint,
            };
      this.locatorsByBlockId.set(block.id, locator);
    }
  }

  private blockIdFor(locator: LogicalLocator): string {
    return locator.kind === 'txt' ? locator.blockId : locator.chapterId;
  }
}

export type { FocusAnchor } from './focusAnchor';
export type { ReaderBlock };
