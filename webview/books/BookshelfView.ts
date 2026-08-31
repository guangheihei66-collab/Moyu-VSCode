import type {
  BookshelfSnapshot,
  PresentationBook,
} from '../../src/shared/protocol/messages';
import { createButton } from '../components/Button';
import { createEmptyState } from '../components/EmptyState';
import { createSectionHeader } from '../components/SectionHeader';
import { createText } from '../components/dom';
import {
  createBookCard,
  type BookCardActions,
  disposeBookCard,
} from './bookCard';

export type BookshelfFilter = 'all' | 'txt' | 'epub';

const noActions: BookCardActions = {
  open: () => undefined,
  relocate: () => undefined,
  selectEncoding: () => undefined,
  remove: () => undefined,
};

export class BookshelfView {
  private snapshot: BookshelfSnapshot = { version: 0, books: [] };
  private query = '';
  private filter: BookshelfFilter = 'all';
  private cardResults: HTMLElement[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: BookCardActions = noActions,
    private readonly importBook: () => void = () => undefined,
  ) {}

  render(snapshot: BookshelfSnapshot): void {
    this.snapshot = snapshot;
    this.renderCurrent();
  }

  setQuery(query: string): void {
    this.query = query;
    this.renderCurrent();
  }

  setFilter(filter: BookshelfFilter): void {
    this.filter = filter;
    this.renderCurrent();
  }

  dispose(): void {
    this.disposeCards();
    this.root.replaceChildren();
  }

  private renderCurrent(): void {
    const document = this.root.ownerDocument;
    this.disposeCards();

    const page = document.createElement('main');
    page.className = 'moyu-bookshelf';
    const header = createSectionHeader(document, {
      title: 'Books',
      description: 'Your local library',
      action: {
        label: 'Import Book',
        variant: 'primary',
        icon: 'books',
        onClick: this.importBook,
      },
    });
    header.querySelector('button')?.setAttribute('data-books-action', 'import');
    page.append(
      header,
      this.renderSearch(document),
      this.renderFilters(document),
      this.renderBookList(document),
    );
    this.root.replaceChildren(page);
  }

  private renderSearch(document: Document): HTMLElement {
    const region = document.createElement('div');
    region.className = 'moyu-bookshelf__search';
    const label = createText(document, 'label', 'Search books');
    const input = document.createElement('input');
    input.id = 'moyu-bookshelf-search';
    input.type = 'search';
    input.value = this.query;
    input.placeholder = 'Search books...';
    label.setAttribute('for', input.id);
    input.setAttribute('aria-label', 'Search books');
    input.addEventListener('input', () => this.setQuery(input.value));
    region.append(label, input);
    return region;
  }

  private renderFilters(document: Document): HTMLElement {
    const region = document.createElement('nav');
    region.className = 'moyu-bookshelf__filters';
    region.setAttribute('aria-label', 'Book type filter');
    for (const filter of ['all', 'txt', 'epub'] as const) {
      const button = createButton(document, {
        label: filter.toUpperCase(),
        variant: this.filter === filter ? 'secondary' : 'quiet',
        pressed: this.filter === filter,
        onClick: () => this.setFilter(filter),
      });
      button.setAttribute('data-books-filter', filter);
      region.append(button);
    }
    return region;
  }

  private renderBookList(document: Document): HTMLElement {
    const list = document.createElement('section');
    list.className = 'moyu-bookshelf__list';
    list.setAttribute('aria-label', 'Bookshelf books');
    const books = this.filteredBooks();
    if (this.snapshot.books.length === 0) {
      const empty = createEmptyState(document, {
        title: 'Your bookshelf is empty',
        description:
          'Import a local TXT or EPUB file. Your original file stays where it is.',
        action: {
          label: 'Import Book',
          variant: 'primary',
          icon: 'books',
          onClick: this.importBook,
        },
      });
      empty
        .querySelector('button')
        ?.setAttribute('data-books-action', 'import');
      list.append(empty);
      return list;
    }

    if (books.length === 0) {
      const hasQuery = this.query.trim().length > 0;
      const filterLabel = this.filter.toUpperCase();
      const empty = createEmptyState(document, {
        title: hasQuery
          ? 'No books match your search'
          : `No ${filterLabel} books match this filter`,
        description: hasQuery
          ? 'Try a different title or clear the search.'
          : 'Choose All or another type filter to see more books.',
        action: hasQuery
          ? {
              label: 'Clear search',
              variant: 'secondary',
              onClick: () => this.setQuery(''),
            }
          : undefined,
      });
      if (hasQuery) {
        empty
          .querySelector('button')
          ?.setAttribute('data-books-clear-query', 'true');
      }
      list.append(empty);
      return list;
    }

    for (const book of books) {
      const result = createBookCard(document, book, this.actions);
      this.cardResults.push(result);
      list.append(result);
    }
    return list;
  }

  private filteredBooks(): readonly PresentationBook[] {
    const query = this.query.trim().toLocaleLowerCase();
    return this.snapshot.books.filter((book) => {
      const matchesFilter = this.filter === 'all' || book.type === this.filter;
      const matchesQuery =
        query.length === 0 || book.title.toLocaleLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  }

  private disposeCards(): void {
    for (const result of this.cardResults) disposeBookCard(result);
    this.cardResults = [];
  }
}

export type { BookshelfBook } from './bookCard';
