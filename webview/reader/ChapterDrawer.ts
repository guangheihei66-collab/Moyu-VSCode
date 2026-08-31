import type { EpubChapterSummary } from '../../src/shared/protocol/messages';
import { createButton } from '../components/Button';
import { createText } from '../components/dom';

export interface ChapterDrawerOptions {
  onSelect?: (chapterId: string) => void;
}

let nextDrawerId = 0;

export class ChapterDrawer {
  private readonly document: Document;
  private readonly onSelect: (chapterId: string) => void;
  private aside: HTMLElement | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly trigger: HTMLButtonElement,
    optionsOrOnSelect:
      | ChapterDrawerOptions
      | ((chapterId: string) => void) = {},
  ) {
    this.document = root.ownerDocument;
    this.onSelect =
      typeof optionsOrOnSelect === 'function'
        ? optionsOrOnSelect
        : (chapterId) => optionsOrOnSelect.onSelect?.(chapterId);
  }

  open(chapters: readonly EpubChapterSummary[], currentId: string): void {
    this.close();
    const aside = this.document.createElement('aside');
    const id = `moyu-chapter-drawer-${++nextDrawerId}`;
    aside.id = id;
    aside.className = 'moyu-chapter-drawer';
    aside.setAttribute('data-chapter-drawer', 'true');
    aside.setAttribute('aria-label', 'Chapter list');
    aside.addEventListener('keydown', this.handleKeydown);

    const heading = createText(this.document, 'h2', 'Chapters');
    const list = this.document.createElement('ol');
    list.className = 'moyu-chapter-drawer__list';
    for (const chapter of chapters) {
      const item = this.document.createElement('li');
      const button = createButton(this.document, {
        label: chapter.title,
        variant: 'quiet',
        onClick: () => this.onSelect(chapter.chapterId),
      });
      button.setAttribute('data-chapter-id', chapter.chapterId);
      button.setAttribute('data-chapter-position', String(chapter.position));
      if (chapter.chapterId === currentId) {
        button.setAttribute('aria-current', 'true');
      }
      item.append(button);
      list.append(item);
    }
    if (chapters.length === 0) {
      list.append(createText(this.document, 'li', 'No chapters available.'));
    }
    aside.append(heading, list);
    this.root.append(aside);
    this.aside = aside;
    this.trigger.setAttribute('aria-haspopup', 'true');
    this.trigger.setAttribute('aria-controls', id);
    this.trigger.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    const aside = this.aside;
    if (aside !== undefined) {
      aside.removeEventListener('keydown', this.handleKeydown);
      aside.remove();
      this.aside = undefined;
    }
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  focusTrigger(): void {
    this.trigger.focus({ preventScroll: true });
  }

  dispose(): void {
    this.close();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.close();
    this.focusTrigger();
  };
}
