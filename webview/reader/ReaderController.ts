import type {
  ReaderBlock,
  ReaderBlockBatch,
} from '../../src/domain/reader/locator';
import { BlockWindow } from './blockWindow';
import type { FocusAnchor } from './focusAnchor';
import { ReaderView } from './ReaderView';

export interface ReaderTransport {
  readBlocks(
    bookId: string,
    anchorBlockId: string | undefined,
    direction: 'before' | 'after',
  ): Promise<ReaderBlockBatch>;
  saveProgress(anchor: FocusAnchor): Promise<unknown>;
}

export class ReaderController {
  private readonly blockWindow = new BlockWindow();
  private root: HTMLElement | undefined;
  private view: ReaderView | undefined;
  private bookId: string | undefined;
  private paused = false;

  constructor(private readonly transport: ReaderTransport) {}

  get isPaused(): boolean {
    return this.paused;
  }

  mount(root: HTMLElement): void {
    this.root = root;
    this.view = new ReaderView(root);
    this.view.setPaused(this.paused);
  }

  async open(bookId: string): Promise<void> {
    this.bookId = bookId;
    const batch = await this.transport.readBlocks(bookId, undefined, 'after');
    this.blockWindow.replace(batch.blocks);
    this.render();
  }

  async loadBefore(): Promise<void> {
    await this.load('before');
  }

  async loadAfter(): Promise<void> {
    await this.load('after');
  }

  async saveAnchor(): Promise<void> {
    const anchor = this.captureAnchor();
    if (anchor !== undefined) await this.transport.saveProgress(anchor);
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

  dispose(): void {
    this.root = undefined;
    this.view = undefined;
    this.bookId = undefined;
    this.blockWindow.replace([]);
  }

  private async load(direction: 'before' | 'after'): Promise<void> {
    if (this.paused || this.bookId === undefined) return;
    const blocks = this.blockWindow.blocks;
    const anchor =
      direction === 'before' ? blocks[0]?.id : blocks[blocks.length - 1]?.id;
    const batch = await this.transport.readBlocks(
      this.bookId,
      anchor,
      direction,
    );
    if (direction === 'before') this.blockWindow.prepend(batch.blocks);
    else this.blockWindow.append(batch.blocks);
    this.render();
  }

  private render(): void {
    this.view?.renderBlocks(this.blockWindow.blocks);
  }

  private pageBy(direction: -1 | 1): void {
    if (this.root === undefined) return;
    this.root.scrollTop += direction * this.root.clientHeight;
  }
}

export type { FocusAnchor } from './focusAnchor';
export type { ReaderBlock };
