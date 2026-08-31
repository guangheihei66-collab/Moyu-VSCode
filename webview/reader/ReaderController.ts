import type {
  ReaderBlock,
  ReaderBlockBatch,
} from '../../src/domain/reader/locator';
import type { LogicalLocator } from '../../src/shared/protocol/messages';
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
      onPrevious: actions.onPrevious ?? (() => this.pageUp()),
      onNext: actions.onNext ?? (() => this.pageDown()),
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
    await this.load('before');
  }

  async loadAfter(): Promise<void> {
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
    if (locator.kind !== 'txt') return false;
    this.locatorsByBlockId.set(locator.blockId, locator);
    return this.restoreFocus({
      blockId: locator.blockId,
      characterOffset: locator.characterOffset,
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
    this.locatorsByBlockId.clear();
    this.blockWindow.replace([]);
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
