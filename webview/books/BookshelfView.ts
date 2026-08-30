import {
  createBookCard,
  type BookCardActions,
  type BookshelfBook,
} from './bookCard';

const noActions: BookCardActions = {
  open: () => undefined,
  relocate: () => undefined,
  selectEncoding: () => undefined,
  remove: () => undefined,
};

export class BookshelfView {
  constructor(
    private readonly root: HTMLElement,
    private readonly actions: BookCardActions = noActions,
    private readonly importBook: () => void = () => undefined,
  ) {}

  render(books: readonly BookshelfBook[]): void {
    const document = this.root.ownerDocument;
    const heading = document.createElement('h1');
    heading.textContent = 'Bookshelf';
    const importButton = document.createElement('button');
    importButton.textContent = 'Import TXT/EPUB';
    importButton.setAttribute('type', 'button');
    importButton.addEventListener('click', this.importBook);
    const list = document.createElement('section');
    list.setAttribute('aria-label', 'Imported books');
    list.append(
      ...books.map((book) => createBookCard(document, book, this.actions)),
    );
    this.root.replaceChildren(heading, importButton, list);
  }
}

export type { BookshelfBook } from './bookCard';
