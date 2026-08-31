import type { ReaderBlock } from '../../src/domain/reader/locator';
import { ActionMenu, type MenuItem } from '../components/ActionMenu';
import { createButton } from '../components/Button';
import { createProgress } from '../components/ProgressBar';
import { createText } from '../components/dom';
import {
  createReaderPresentationModel,
  type ReaderPresentationModel,
} from './readerModel';
import {
  captureFocusAnchor,
  restoreFocusAnchor,
  type FocusAnchor,
} from './focusAnchor';

export type ReaderAction = 'chapters' | 'settings' | 'relocate' | 'info';

export interface ReaderViewActions {
  onBack?: () => void;
  onAction?: (action: ReaderAction) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export class ReaderView {
  private readonly document: Document;
  private actionMenu: ActionMenu | undefined;
  private toolbar: HTMLElement | undefined;
  private progressRegions: HTMLElement[] = [];
  private quiet = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: ReaderViewActions = {},
  ) {
    this.document = root.ownerDocument;
    root.className = 'moyu-reader';
    root.setAttribute('role', 'main');
    root.setAttribute('aria-label', 'Reader');
  }

  render(
    model: ReaderPresentationModel,
    blocks: readonly ReaderBlock[] = [],
  ): void {
    this.actionMenu?.dispose();
    this.actionMenu = undefined;

    const toolbar = this.renderToolbar(model);
    const content = this.renderContent(model, blocks);
    const navigation = this.renderNavigation(model);
    this.root.replaceChildren(toolbar, content, navigation);
    this.toolbar = toolbar;
    this.progressRegions = [
      ...Array.from(
        this.root.querySelectorAll<HTMLElement>('[data-reader-progress]'),
      ),
    ];
    this.applyQuietState();
  }

  renderBlocks(blocks: readonly ReaderBlock[]): void {
    const firstBlock = blocks[0];
    this.render(
      createReaderPresentationModel(
        {
          bookId: firstBlock?.id ?? 'reader',
          title: 'Reader',
          type: 'txt',
        },
        blocks,
        blocks.length === 0,
        blocks.length === 0,
      ),
      blocks,
    );
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
    this.applyQuietState();
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

  dispose(): void {
    this.actionMenu?.dispose();
    this.actionMenu = undefined;
    this.toolbar = undefined;
    this.progressRegions = [];
  }

  private renderToolbar(model: ReaderPresentationModel): HTMLElement {
    const toolbar = this.document.createElement('header');
    toolbar.className = 'moyu-reader__toolbar';
    toolbar.setAttribute('data-reader-toolbar', 'true');
    toolbar.setAttribute('data-reader-quiet-on-interaction', 'true');

    const back = createButton(this.document, {
      label: 'Back to Books',
      icon: 'back',
      variant: 'quiet',
      onClick: () => this.actions.onBack?.(),
    });
    back.setAttribute('data-reader-action', 'back');

    const context = this.document.createElement('div');
    context.className = 'moyu-reader__context';
    context.append(
      createText(this.document, 'h1', model.title),
      createText(
        this.document,
        'p',
        `${model.type.toUpperCase()} · ${model.percentage}%`,
      ),
    );
    const contextMetadata = context.querySelector('p');
    contextMetadata?.setAttribute('data-reader-context', 'true');
    if (model.chapterTitle !== undefined) {
      const chapter = createText(this.document, 'p', model.chapterTitle);
      chapter.setAttribute('data-reader-chapter', 'true');
      context.append(chapter);
    }

    const progress = createProgress(this.document, {
      value: model.percentage,
      label: 'Reading progress',
    });
    progress.setAttribute('data-reader-progress', 'true');

    const menuHost = this.document.createElement('div');
    menuHost.className = 'moyu-reader__menu';
    const menuTrigger = createButton(this.document, {
      label: 'Reader actions',
      icon: 'more',
      variant: 'quiet',
      title: 'Reader actions',
    });
    menuTrigger.setAttribute('data-reader-menu', 'true');
    menuHost.append(menuTrigger);
    const menu = new ActionMenu(this.document);
    menu.mount(menuTrigger, this.menuItems(model));
    this.actionMenu = menu;
    toolbar.append(back, context, progress, menuHost);
    return toolbar;
  }

  private renderContent(
    model: ReaderPresentationModel,
    blocks: readonly ReaderBlock[],
  ): HTMLElement {
    const content = this.document.createElement('section');
    content.className = 'moyu-reader__content';
    content.setAttribute('data-reader-content', 'true');
    content.setAttribute('role', 'feed');
    content.setAttribute('aria-label', 'Reading content');

    if (blocks.length > 0) {
      content.append(...blocks.map((block) => this.renderBlock(block)));
    } else if (model.paragraphs.length > 0) {
      content.append(this.renderParagraphBlock(model.bookId, model.paragraphs));
    } else {
      const empty = createText(this.document, 'p', 'Nothing to read yet.');
      empty.setAttribute('data-reader-empty', 'true');
      content.append(empty);
    }
    return content;
  }

  private renderBlock(block: ReaderBlock): HTMLElement {
    return this.renderParagraphBlock(block.id, block.paragraphs, block);
  }

  private renderParagraphBlock(
    blockId: string,
    paragraphs: readonly string[],
    block?: ReaderBlock,
  ): HTMLElement {
    const article = this.document.createElement('article');
    article.className = 'moyu-reader__block';
    article.setAttribute('data-reader-block', blockId);
    article.dataset.readerBlock = blockId;
    article.setAttribute('aria-label', `Reading block ${blockId}`);
    if (block !== undefined)
      article.dataset.blockFingerprint = block.contentFingerprint;

    for (const paragraphText of paragraphs) {
      const paragraph = this.document.createElement('p');
      paragraph.className = 'moyu-reader__paragraph';
      paragraph.setAttribute('data-reader-paragraph', 'true');
      paragraph.setAttribute('data-block-id', blockId);
      paragraph.dataset.blockId = blockId;
      paragraph.tabIndex = 0;
      paragraph.textContent = paragraphText;
      article.append(paragraph);
    }
    return article;
  }

  private renderNavigation(model: ReaderPresentationModel): HTMLElement {
    const navigation = this.document.createElement('nav');
    navigation.className = 'moyu-reader__navigation';
    navigation.setAttribute('aria-label', 'Reader paging');
    navigation.setAttribute('data-reader-navigation', 'true');

    const previous = createButton(this.document, {
      label: 'Previous',
      icon: 'back',
      variant: 'quiet',
      disabled: model.atStart,
      onClick: () => this.actions.onPrevious?.(),
    });
    previous.setAttribute('data-reader-action', 'previous');
    const progress = createProgress(this.document, {
      value: model.percentage,
      label: 'Reading progress',
    });
    progress.setAttribute('data-reader-progress', 'true');
    const next = createButton(this.document, {
      label: 'Next',
      icon: 'forward',
      variant: 'quiet',
      disabled: model.atEnd,
      onClick: () => this.actions.onNext?.(),
    });
    next.setAttribute('data-reader-action', 'next');
    navigation.append(previous, progress, next);
    return navigation;
  }

  private menuItems(model: ReaderPresentationModel): readonly MenuItem[] {
    const items: MenuItem[] = [];
    if (model.type === 'epub') {
      items.push({
        id: 'chapters',
        label: 'Chapter list',
        onSelect: () => this.actions.onAction?.('chapters'),
      });
    }
    items.push(
      {
        id: 'settings',
        label: 'Reading settings',
        onSelect: () => this.actions.onAction?.('settings'),
      },
      {
        id: 'relocate',
        label: 'Relocate file',
        onSelect: () => this.actions.onAction?.('relocate'),
      },
      {
        id: 'info',
        label: 'Book information',
        onSelect: () => this.actions.onAction?.('info'),
      },
    );
    return items;
  }

  private applyQuietState(): void {
    const value = String(this.quiet);
    this.toolbar?.setAttribute('data-reader-quiet', value);
    for (const progress of this.progressRegions) {
      progress.setAttribute('data-reader-quiet', value);
      progress.setAttribute('data-reader-quiet-on-interaction', 'true');
    }
  }
}

export type { FocusAnchor } from './focusAnchor';
