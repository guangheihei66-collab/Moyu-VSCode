import { describe, expect, it, vi } from 'vitest';

import type {
  BookshelfSnapshot,
  PresentationBook,
} from '../../../src/shared/protocol/messages';
import {
  BookshelfController,
  type BookshelfClient,
} from '../../../webview/books/BookshelfController';
import { BookshelfView } from '../../../webview/books/BookshelfView';

type Listener = (event?: { key?: string; preventDefault?: () => void }) => void;

class ElementStub {
  readonly children: ElementStub[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener>();
  readonly dataset: Record<string, string> = {};
  ownerDocument!: DocumentStub;
  parentElement: ElementStub | null = null;
  className = '';
  disabled = false;
  hidden = false;
  id = '';
  tabIndex = 0;
  textContent = '';
  type = '';
  value = '';

  constructor(readonly tagName: string) {}

  append(...items: ElementStub[]): void {
    for (const item of items) {
      item.parentElement = this;
      this.children.push(item);
    }
  }

  replaceChildren(...items: ElementStub[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    this.append(...items);
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string, listener: Listener): void {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }

  dispatch(name: string, event: { key?: string } = {}): void {
    this.listeners.get(name)?.({ ...event, preventDefault: () => undefined });
  }

  click(): void {
    if (!this.disabled) this.dispatch('click');
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  remove(): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') this.id = value;
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string): ElementStub | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): ElementStub[] {
    const result: ElementStub[] = [];
    const matches = (element: ElementStub): boolean => {
      if (selector === 'button') return element.tagName === 'BUTTON';
      if (selector === 'input') return element.tagName === 'INPUT';
      if (selector === '[role="menuitem"]')
        return element.getAttribute('role') === 'menuitem';
      const dataMatch = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (dataMatch?.[1] !== undefined) {
        const key = dataMatch[1].replace(/-([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        );
        const value = element.dataset[key];
        return (
          value !== undefined &&
          (dataMatch[2] === undefined || value === dataMatch[2])
        );
      }
      return false;
    };
    const visit = (element: ElementStub): void => {
      for (const child of element.children) {
        if (matches(child)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join(' ')
    );
  }
}

class DocumentStub {
  readonly body = new ElementStub('BODY');
  activeElement: ElementStub | null = null;

  constructor() {
    this.body.ownerDocument = this;
  }

  createElement(tagName: string): ElementStub {
    const element = new ElementStub(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

function book(
  bookId: string,
  title: string,
  type: PresentationBook['type'],
  percentage: number,
  sourceMissing = false,
): PresentationBook {
  return {
    bookId,
    title,
    type,
    percentage,
    lastOpenedAt: Number(bookId.replace(/\D/g, '')) || 1,
    sourceMissing,
    ...(type === 'epub' ? { chapterLabel: 'Chapter 2' } : {}),
  };
}

const snapshot: BookshelfSnapshot = {
  version: 4,
  books: [
    book('book-1', '<img onerror=steal()>', 'epub', 42),
    book('book-2', 'Middle TXT', 'txt', 0),
    book('book-3', 'Missing EPUB', 'epub', 12, true),
  ],
};

function rootFor(document = new DocumentStub()): ElementStub {
  return document.createElement('main');
}

describe('Bookshelf Webview', () => {
  it('renders compact rows, safe metadata, and exact overflow actions', () => {
    const root = rootFor();
    const actions = {
      open: vi.fn(),
      relocate: vi.fn(),
      selectEncoding: vi.fn(),
      remove: vi.fn(),
    };
    const view = new BookshelfView(root as unknown as HTMLElement, actions);

    view.render(snapshot);

    expect(root.querySelectorAll('[data-book-row]')).toHaveLength(3);
    expect(root.fullText).toContain('42%');
    expect(root.fullText).toContain('Chapter 2');
    expect(root.fullText).toContain('Last read');
    expect(root.fullText).toContain('Source unavailable');
    expect(root.fullText).toContain('<img onerror=steal()>');
    expect(root.fullText).not.toContain('file:///');
    expect(root.fullText).not.toContain('Delete novel');

    root.querySelector('[data-book-menu="book-1"]')?.click();
    expect(root.fullText).toContain('Open');
    expect(root.fullText).toContain('Relocate file');
    expect(root.fullText).toContain('Reselect encoding');
    expect(root.fullText).toContain('Remove from bookshelf');

    root.querySelector('[data-book-menu="book-3"]')?.click();
    const menuItems =
      root
        .querySelector('[data-book-row="book-3"]')
        ?.querySelectorAll('[role="menuitem"]') ?? [];
    expect(menuItems.map((item) => item.fullText)).not.toContain(
      'Reselect encoding',
    );
  });

  it('uses local case-insensitive search and mutually exclusive type filters', () => {
    const root = rootFor();
    const view = new BookshelfView(root as unknown as HTMLElement);
    view.render(snapshot);

    view.setQuery('middle');
    expect(root.querySelectorAll('[data-book-row]')).toHaveLength(1);
    expect(root.fullText).toContain('Middle TXT');

    view.setQuery('');
    view.setFilter('epub');
    expect(root.querySelectorAll('[data-book-row]')).toHaveLength(2);
    expect(root.fullText).toContain('Missing EPUB');
    expect(root.fullText).not.toContain('Middle TXT');

    view.setQuery('does not exist');
    expect(root.fullText).toContain('No books match your search');
    root.querySelector('[data-books-clear-query]')?.click();
    expect(root.querySelectorAll('[data-book-row]')).toHaveLength(2);
  });

  it('makes Relocate the primary action for a missing source and renders useful empty states', () => {
    const root = rootFor();
    const actions = {
      open: vi.fn(),
      relocate: vi.fn(),
      selectEncoding: vi.fn(),
      remove: vi.fn(),
    };
    const view = new BookshelfView(root as unknown as HTMLElement, actions);
    view.render(snapshot);

    root.querySelector('[data-book-action="relocate-book-3"]')?.click();
    expect(actions.relocate).toHaveBeenCalledWith('book-3');

    view.render({ version: 0, books: [] });
    expect(root.fullText).toContain('Your bookshelf is empty');
    expect(root.fullText).toContain('Your original file stays where it is.');

    view.render({ version: 0, books: snapshot.books });
    view.setFilter('all');
    view.setQuery('no match');
    expect(root.fullText).toContain('No books match your search');
  });
});

describe('BookshelfController', () => {
  it('loads snapshots and routes typed open, import, relocate, encoding, and remove actions', async () => {
    const root = rootFor();
    const client: BookshelfClient = {
      readBooks: vi.fn(async () => snapshot),
      open: vi.fn(async () => ({ version: 4, anchor: null })),
      importBook: vi.fn(async () => snapshot),
      relocateBook: vi.fn(async () => snapshot),
      selectBookEncoding: vi.fn(async () => snapshot),
      removeBook: vi.fn(async () => ({ version: 5, books: [] })),
    };
    const controller = new BookshelfController(client);

    controller.mount(root as unknown as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.readBooks).toHaveBeenCalledOnce();

    await controller.importBook();
    await controller.relocate('book-3');
    await controller.selectEncoding('book-2');
    await controller.confirmRemove('book-1');
    await controller.open('book-1');

    expect(client.importBook).toHaveBeenCalledOnce();
    expect(client.relocateBook).toHaveBeenCalledWith('book-3');
    expect(client.selectBookEncoding).toHaveBeenCalledWith('book-2');
    expect(client.removeBook).toHaveBeenCalledWith('book-1');
    expect(client.open).toHaveBeenCalledWith('book-1');
    controller.dispose();
  });

  it('keeps legacy picker cancellation and explicit confirmation as no-op boundaries', async () => {
    const client = { request: vi.fn(async () => undefined) };
    const dialogs = {
      pickBook: vi.fn(async () => undefined),
      confirmRemove: vi.fn(async () => false),
    };
    const controller = new BookshelfController(client, dialogs);
    controller.render(snapshot);

    await controller.importBook();
    await controller.confirmRemove('book-1');
    expect(client.request).not.toHaveBeenCalled();
  });
});
