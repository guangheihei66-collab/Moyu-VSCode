import type { ReaderBlock } from '../../src/domain/reader/locator';
import {
  captureFocusAnchor,
  restoreFocusAnchor,
  type FocusAnchor,
} from './focusAnchor';

export class ReaderView {
  constructor(private readonly root: HTMLElement) {
    root.setAttribute('role', 'feed');
    root.setAttribute('aria-label', 'Reader');
  }

  renderBlocks(blocks: readonly ReaderBlock[]): void {
    this.root.replaceChildren(
      ...blocks.map((block) => this.renderBlock(block)),
    );
  }

  setPaused(paused: boolean): void {
    this.root.dataset.paused = String(paused);
    this.root.setAttribute('aria-busy', String(paused));
  }

  captureFocus(): FocusAnchor | undefined {
    return captureFocusAnchor(this.root);
  }

  restoreFocus(anchor: FocusAnchor): boolean {
    return restoreFocusAnchor(this.root, anchor);
  }

  private renderBlock(block: ReaderBlock): HTMLElement {
    const article = this.root.ownerDocument.createElement('article');
    article.dataset.readerBlock = block.id;
    article.setAttribute('aria-label', `Reading block ${block.id}`);

    for (const paragraphText of block.paragraphs) {
      const paragraph = this.root.ownerDocument.createElement('p');
      paragraph.dataset.blockId = block.id;
      paragraph.tabIndex = 0;
      paragraph.textContent = paragraphText;
      article.append(paragraph);
    }
    return article;
  }
}
