import { describe, expect, it, vi } from 'vitest';

import type { HomeSnapshot } from '../../../src/shared/protocol/messages';
import { HomeController } from '../../../webview/home/HomeController';
import { HomeView } from '../../../webview/home/HomeView';
import { MessageClient } from '../../../webview/shell/messageClient';

class ElementStub {
  readonly children: ElementStub[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  ownerDocument!: DocumentStub;
  parentElement: ElementStub | null = null;
  textContent = '';
  type = '';
  disabled = false;

  constructor(readonly tagName: string) {}

  append(...items: ElementStub[]): void {
    for (const item of items) {
      item.parentElement = this;
      this.children.push(item);
    }
  }

  replaceChildren(...items: ElementStub[]): void {
    this.children.splice(0, this.children.length);
    this.append(...items);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  click(): void {
    this.listeners.get('click')?.();
  }

  querySelector(selector: string): ElementStub | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): ElementStub[] {
    const found: ElementStub[] = [];
    const matches = (element: ElementStub): boolean => {
      if (selector === 'button') return element.tagName === 'BUTTON';
      const actionMatch = /^\[data-home-action="([^"]+)"\]$/.exec(selector);
      if (actionMatch?.[1] !== undefined) {
        return element.getAttribute('data-home-action') === actionMatch[1];
      }
      return false;
    };
    const visit = (element: ElementStub): void => {
      for (const child of element.children) {
        if (matches(child)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join('')
    );
  }
}

class DocumentStub {
  createElement(tagName: string): ElementStub {
    const element = new ElementStub(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

const populatedSnapshot: HomeSnapshot = {
  continueReading: {
    bookId: 'book-1',
    title: '<safe text>',
    type: 'epub',
    percentage: 42,
    lastOpenedAt: 20,
    sourceMissing: false,
    chapterLabel: 'Chapter 2',
  },
  recentBooks: [
    {
      bookId: 'book-1',
      title: '<safe text>',
      type: 'epub',
      percentage: 42,
      lastOpenedAt: 20,
      sourceMissing: false,
      chapterLabel: 'Chapter 2',
    },
    {
      bookId: 'book-2',
      title: 'Second book',
      type: 'txt',
      percentage: 0,
      lastOpenedAt: 10,
      sourceMissing: true,
    },
  ],
  booksCount: 2,
};

describe('HomeView', () => {
  it('renders Continue Reading, Quick Access, Recent Books, and safe titles', () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const actions: unknown[] = [];
    const view = new HomeView(root as unknown as HTMLElement, (action) =>
      actions.push(action),
    );

    view.render(populatedSnapshot);

    expect(root.fullText).toContain('Continue Reading');
    expect(root.fullText).toContain('<safe text>');
    expect(root.fullText).toContain('42%');
    expect(root.fullText).toContain('Chapter 2');
    expect(root.fullText).toContain('Quick Access');
    expect(root.fullText).toContain('2 books');
    expect(root.fullText).toContain('Recent Books');
    expect(root.fullText).toContain('Source unavailable');
    expect(root.fullText).not.toContain('2048');
    expect(root.fullText).not.toContain('Best score');
    expect(root.fullText).not.toContain('file:///');

    root.querySelector('[data-home-action="continue-book-1"]')?.click();
    expect(actions).toEqual([{ type: 'continue', bookId: 'book-1' }]);
  });

  it('renders useful no-book and no-progress actions', () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const actions: unknown[] = [];
    const view = new HomeView(root as unknown as HTMLElement, (action) =>
      actions.push(action),
    );

    view.render({
      recentBooks: [],
      booksCount: 0,
    });
    expect(root.fullText).toContain('Import your first book');
    root.querySelector('[data-home-action="books"]')?.click();

    view.render({
      recentBooks: [populatedSnapshot.recentBooks[0]!],
      booksCount: 1,
    });
    expect(root.fullText).toContain('Open a book to start reading');
    expect(root.fullText).not.toContain('Start a game');
    expect(root.fullText).not.toContain('2048');
    expect(actions).toEqual([{ type: 'navigate', section: 'books' }]);
  });
});

describe('HomeController', () => {
  it('loads a read-only snapshot and forwards typed actions', async () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const readHome = vi.fn(async () => populatedSnapshot);
    const onAction = vi.fn();
    const controller = new HomeController({ readHome }, onAction);

    controller.mount(root as unknown as HTMLElement);
    await Promise.resolve();
    await Promise.resolve();

    expect(readHome).toHaveBeenCalledOnce();
    expect(root.fullText).toContain('Continue Reading');
    root.querySelector('[data-home-action="books"]')?.click();
    expect(onAction).toHaveBeenCalledWith({
      type: 'navigate',
      section: 'books',
    });
    controller.dispose();
  });
});

describe('Home MessageClient transport', () => {
  it('correlates a validated home snapshot to the current Webview session', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(api, 'session-home', 1000, () => 'home-1');
    const pending = client.readHome();

    expect(api.postMessage).toHaveBeenCalledWith({
      protocol: 1,
      id: 'home-1',
      sessionId: 'session-home',
      type: 'home/read',
      payload: {},
    });
    expect(
      client.handleMessage({
        protocol: 1,
        id: 'home-response-1',
        sessionId: 'session-home',
        type: 'home/snapshot',
        payload: { requestId: 'home-1', snapshot: populatedSnapshot },
      }),
    ).toBe(true);
    await expect(pending).resolves.toEqual(populatedSnapshot);
  });
});
