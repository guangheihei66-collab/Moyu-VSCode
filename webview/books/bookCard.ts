import type { PresentationBook } from '../../src/shared/protocol/messages';
import { ActionMenu, type MenuItem } from '../components/ActionMenu';
import { createButton } from '../components/Button';
import { createProgress } from '../components/ProgressBar';
import { createText } from '../components/dom';

export type BookshelfBook = PresentationBook;

export interface BookCardActions {
  open(bookId: string): void;
  relocate(bookId: string): void;
  selectEncoding(bookId: string): void;
  remove(bookId: string): void;
}

interface ManagedBookCard extends HTMLElement {
  disposeMenu?: () => void;
}

export function createBookCard(
  document: Document,
  book: BookshelfBook,
  actions: BookCardActions,
): HTMLElement {
  const row = document.createElement('article');
  row.className = 'moyu-book-row';
  row.setAttribute('data-book-row', book.bookId);
  row.setAttribute('data-book-id', book.bookId);
  row.setAttribute('aria-label', book.title);

  const copy = document.createElement('div');
  copy.className = 'moyu-book-row__copy';
  copy.append(
    createText(document, 'h2', book.title),
    createText(document, 'p', metadataLabel(book)),
  );
  if (book.chapterLabel !== undefined) {
    copy.append(createText(document, 'p', book.chapterLabel));
  }
  if (book.sourceMissing) {
    const missing = createText(document, 'p', 'Source unavailable');
    missing.className = 'moyu-book-row__missing';
    missing.setAttribute('role', 'status');
    copy.append(missing);
  }
  copy.append(
    createProgress(document, {
      value: book.percentage,
      label: `${book.title} reading progress`,
    }),
  );

  const controls = document.createElement('div');
  controls.className = 'moyu-book-row__actions';
  const primary = createButton(document, {
    label: book.sourceMissing
      ? 'Relocate'
      : book.percentage > 0
        ? 'Continue'
        : 'Open',
    variant: 'primary',
    onClick: () =>
      book.sourceMissing
        ? actions.relocate(book.bookId)
        : actions.open(book.bookId),
  });
  primary.setAttribute(
    'data-book-action',
    `${book.sourceMissing ? 'relocate' : 'open'}-${book.bookId}`,
  );

  const menuTrigger = createButton(document, {
    label: `More actions for ${book.title}`,
    icon: 'more',
    variant: 'quiet',
    title: 'More actions',
  });
  menuTrigger.setAttribute('data-book-menu', book.bookId);
  controls.append(primary, menuTrigger);

  const menu = new ActionMenu(document);
  menu.mount(menuTrigger, menuItems(book, actions));
  row.append(copy, controls);
  (row as ManagedBookCard).disposeMenu = () => menu.dispose();
  return row;
}

export function disposeBookCard(card: HTMLElement): void {
  (card as ManagedBookCard).disposeMenu?.();
}

function menuItems(
  book: BookshelfBook,
  actions: BookCardActions,
): readonly MenuItem[] {
  const items: MenuItem[] = [
    {
      id: 'open',
      label: 'Open',
      disabled: book.sourceMissing,
      onSelect: () => actions.open(book.bookId),
    },
    {
      id: 'relocate',
      label: 'Relocate file',
      onSelect: () => actions.relocate(book.bookId),
    },
  ];
  if (book.type === 'txt') {
    items.push({
      id: 'encoding',
      label: 'Reselect encoding',
      onSelect: () => actions.selectEncoding(book.bookId),
    });
  }
  items.push({
    id: 'remove',
    label: 'Remove from bookshelf',
    onSelect: () => actions.remove(book.bookId),
  });
  return items;
}

function metadataLabel(book: BookshelfBook): string {
  const progress = book.percentage > 0 ? ` · ${book.percentage}%` : '';
  const lastRead =
    book.lastOpenedAt === undefined
      ? 'Not opened yet'
      : `Last read ${new Date(book.lastOpenedAt).toLocaleDateString()}`;
  return `${book.type.toUpperCase()}${progress} · ${lastRead}`;
}
