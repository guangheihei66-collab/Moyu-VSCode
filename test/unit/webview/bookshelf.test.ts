import { describe, expect, it, vi } from 'vitest';
import { BookshelfController } from '../../../webview/books/BookshelfController';
import { BookshelfView } from '../../../webview/books/BookshelfView';

class ElementStub {
  children: ElementStub[] = [];
  textContent = '';
  dataset: Record<string, string> = {};
  ownerDocument!: DocumentStub;
  listeners = new Map<string, () => void>();
  append(...items: ElementStub[]) {
    this.children.push(...items);
  }
  replaceChildren(...items: ElementStub[]) {
    this.children = items;
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener);
  }
  setAttribute() {}
  get fullText(): string {
    return (
      this.textContent + this.children.map((item) => item.fullText).join(' ')
    );
  }
}
class DocumentStub {
  createElement() {
    const value = new ElementStub();
    value.ownerDocument = this;
    return value;
  }
}

describe('Bookshelf Webview', () => {
  it('renders untrusted titles as text with explicit bookshelf wording', () => {
    const root = new ElementStub();
    root.ownerDocument = new DocumentStub();
    new BookshelfView(root as unknown as HTMLElement).render([
      {
        id: 'b',
        title: '<img onerror=steal()>',
        uri: 'file:///book.txt',
        type: 'txt',
      },
    ]);
    expect(root.fullText).toContain('<img onerror=steal()>');
    expect(root.fullText).toContain('Remove from bookshelf');
    expect(root.fullText).not.toContain('Delete novel');
  });

  it('does not send an import request when the picker is cancelled', async () => {
    const client = { request: vi.fn() };
    const controller = new BookshelfController(client, {
      pickBook: vi.fn(async () => undefined),
      confirmRemove: vi.fn(),
    });
    await controller.importBook();
    expect(client.request).not.toHaveBeenCalled();
  });

  it('sends selected imports and gates removal behind explicit confirmation', async () => {
    const client = { request: vi.fn(async () => undefined) };
    const dialogs = {
      pickBook: vi.fn(async () => 'file:///book.epub'),
      confirmRemove: vi.fn(async () => false),
    };
    const controller = new BookshelfController(client, dialogs);
    controller.render([
      { id: 'b', title: 'Book', uri: 'file:///book.epub', type: 'epub' },
    ]);
    await controller.importBook();
    await controller.confirmRemove('b');
    expect(client.request).toHaveBeenCalledWith('books/import', {
      uri: 'file:///book.epub',
    });
    expect(client.request).not.toHaveBeenCalledWith('books/remove', {
      bookId: 'b',
    });

    dialogs.confirmRemove.mockResolvedValue(true);
    await controller.confirmRemove('b');
    expect(client.request).toHaveBeenCalledWith('books/remove', {
      bookId: 'b',
    });
  });
});
