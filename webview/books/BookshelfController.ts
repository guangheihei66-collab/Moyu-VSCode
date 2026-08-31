import type {
  BookshelfSnapshot,
  LogicalLocator,
} from '../../src/shared/protocol/messages';
import { BookshelfView, type BookshelfFilter } from './BookshelfView';
import type { BookshelfBook, BookCardActions } from './bookCard';

export interface BookshelfClient {
  readBooks?(): Promise<BookshelfSnapshot>;
  open?(bookId: string): Promise<{
    version: number;
    anchor: LogicalLocator | null;
  }>;
  importBook?(): Promise<BookshelfSnapshot>;
  relocateBook?(bookId: string): Promise<BookshelfSnapshot>;
  selectBookEncoding?(bookId: string): Promise<BookshelfSnapshot>;
  removeBook?(bookId: string): Promise<BookshelfSnapshot>;
  request?(type: string, payload?: Record<string, unknown>): Promise<unknown>;
}

export interface BookshelfDialogs {
  pickBook(): Promise<string | undefined>;
  pickRelocation?(book: BookshelfBook): Promise<string | undefined>;
  confirmRemove(book: BookshelfBook): Promise<boolean> | boolean;
}

export type BookshelfOpenHandler =
  | ((bookId: string) => void | Promise<void>)
  | undefined;

const emptySnapshot: BookshelfSnapshot = { version: 0, books: [] };

export class BookshelfController {
  private view: BookshelfView | undefined;
  private snapshot: BookshelfSnapshot = emptySnapshot;
  private generation = 0;

  constructor(
    private readonly client: BookshelfClient,
    private readonly dialogs?: BookshelfDialogs,
    private readonly onOpen?: BookshelfOpenHandler,
  ) {}

  mount(root: HTMLElement): void {
    this.view?.dispose();
    const generation = ++this.generation;
    const actions: BookCardActions = {
      open: (bookId) => void this.run(() => this.open(bookId)),
      relocate: (bookId) => void this.run(() => this.relocate(bookId)),
      selectEncoding: (bookId) =>
        void this.run(() => this.selectEncoding(bookId)),
      remove: (bookId) => void this.run(() => this.confirmRemove(bookId)),
    };
    this.view = new BookshelfView(
      root,
      actions,
      () => void this.run(() => this.importBook()),
    );
    this.view.render(this.snapshot);
    void this.refresh(generation);
  }

  render(snapshot: BookshelfSnapshot): void {
    this.snapshot = snapshot;
    this.view?.render(snapshot);
  }

  setQuery(query: string): void {
    this.view?.setQuery(query);
  }

  setFilter(filter: BookshelfFilter): void {
    this.view?.setFilter(filter);
  }

  async open(bookId: string): Promise<void> {
    if (this.onOpen !== undefined) {
      await this.onOpen(bookId);
      return;
    }
    if (this.client.open !== undefined) {
      await this.client.open(bookId);
      return;
    }
    await this.request('reader/open', { bookId });
  }

  async importBook(): Promise<void> {
    if (this.client.importBook !== undefined) {
      this.render(await this.client.importBook());
      return;
    }
    const uri = await this.dialogs?.pickBook();
    if (uri === undefined) return;
    await this.requestAndRefresh('books/import', { uri });
  }

  async confirmRemove(bookId: string): Promise<void> {
    if (this.client.removeBook !== undefined) {
      this.render(await this.client.removeBook(bookId));
      return;
    }
    const book = this.findBook(bookId);
    if (book === undefined || this.dialogs === undefined) return;
    if (!(await this.dialogs.confirmRemove(book))) return;
    await this.requestAndRefresh('books/remove', { bookId });
  }

  async relocate(bookId: string): Promise<void> {
    if (this.client.relocateBook !== undefined) {
      this.render(await this.client.relocateBook(bookId));
      return;
    }
    const book = this.findBook(bookId);
    const pickRelocation = this.dialogs?.pickRelocation;
    if (book === undefined || pickRelocation === undefined) return;
    const uri = await pickRelocation(book);
    if (uri === undefined) return;
    await this.requestAndRefresh('books/relocate', { bookId, uri });
  }

  async selectEncoding(bookId: string): Promise<void> {
    if (this.client.selectBookEncoding !== undefined) {
      this.render(await this.client.selectBookEncoding(bookId));
      return;
    }
    await this.requestAndRefresh('books/selectEncoding', { bookId });
  }

  dispose(): void {
    this.generation += 1;
    this.view?.dispose();
    this.view = undefined;
  }

  private async refresh(generation: number): Promise<void> {
    if (this.client.readBooks === undefined) return;
    try {
      const snapshot = await this.client.readBooks();
      if (generation === this.generation) this.render(snapshot);
    } catch {
      // The initial empty snapshot keeps the Books route usable while the Host
      // reports a safe correlated error through the normal message boundary.
    }
  }

  private async requestAndRefresh(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const response = await this.request(type, payload);
    if (isBookshelfSnapshot(response)) {
      this.render(response);
      return;
    }
    await this.refresh(this.generation);
  }

  private async request(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.client.request === undefined) return undefined;
    return this.client.request(type, payload);
  }

  private findBook(bookId: string): BookshelfBook | undefined {
    return this.snapshot.books.find((book) => book.bookId === bookId);
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      // Safe correlated Host errors are surfaced by the next explicit read;
      // a rejected click handler must not become an unhandled Webview error.
    }
  }
}

function isBookshelfSnapshot(value: unknown): value is BookshelfSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { version?: unknown; books?: unknown };
  return (
    Number.isSafeInteger(candidate.version) && Array.isArray(candidate.books)
  );
}
