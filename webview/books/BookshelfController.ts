import type { BookshelfBook } from './bookCard';
import { BookshelfView } from './BookshelfView';

export interface BookshelfClient {
  request(type: string, payload?: Record<string, unknown>): Promise<unknown>;
}

export interface BookshelfDialogs {
  pickBook(): Promise<string | undefined>;
  pickRelocation?(book: BookshelfBook): Promise<string | undefined>;
  confirmRemove(book: BookshelfBook): Promise<boolean> | boolean;
}

export class BookshelfController {
  private view: BookshelfView | undefined;
  private books: BookshelfBook[] = [];

  constructor(
    private readonly client: BookshelfClient,
    private readonly dialogs: BookshelfDialogs,
  ) {}

  mount(root: HTMLElement): void {
    this.view = new BookshelfView(
      root,
      {
        open: (bookId) => void this.client.request('reader/open', { bookId }),
        relocate: (bookId) => void this.relocate(bookId),
        selectEncoding: (bookId) =>
          void this.client.request('books/selectEncoding', { bookId }),
        remove: (bookId) => void this.confirmRemove(bookId),
      },
      () => void this.importBook(),
    );
    this.view.render(this.books);
  }

  render(books: readonly BookshelfBook[]): void {
    this.books = [...books];
    this.view?.render(this.books);
  }

  async importBook(): Promise<void> {
    const uri = await this.dialogs.pickBook();
    if (uri === undefined) return;
    await this.client.request('books/import', { uri });
  }

  async confirmRemove(bookId: string): Promise<void> {
    const book = this.books.find((item) => item.id === bookId);
    if (book === undefined || !(await this.dialogs.confirmRemove(book))) return;
    await this.client.request('books/remove', { bookId });
  }

  async relocate(bookId: string): Promise<void> {
    const book = this.books.find((item) => item.id === bookId);
    if (book === undefined || this.dialogs.pickRelocation === undefined) return;
    const uri = await this.dialogs.pickRelocation(book);
    if (uri === undefined) return;
    await this.client.request('books/relocate', { bookId, uri });
  }
}
