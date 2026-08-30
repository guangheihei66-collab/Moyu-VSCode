export interface BookshelfBook {
  id: string;
  title: string;
  uri: string;
  type: 'txt' | 'epub';
  encoding?: string;
  sourceMissing?: boolean;
}

export interface BookCardActions {
  open(bookId: string): void;
  relocate(bookId: string): void;
  selectEncoding(bookId: string): void;
  remove(bookId: string): void;
}

export function createBookCard(
  document: Document,
  book: BookshelfBook,
  actions: BookCardActions,
): HTMLElement {
  const card = document.createElement('article');
  card.dataset.bookId = book.id;
  card.setAttribute('aria-label', book.title);

  const title = document.createElement('h2');
  title.textContent = book.title;
  const pathLabel = document.createElement('p');
  pathLabel.textContent = displayPath(book.uri);
  card.append(title, pathLabel);

  const controls = document.createElement('div');
  controls.dataset.bookActions = '';
  controls.append(
    actionButton(document, book.sourceMissing ? 'Relocate' : 'Continue', () =>
      book.sourceMissing ? actions.relocate(book.id) : actions.open(book.id),
    ),
  );
  if (book.type === 'txt') {
    controls.append(
      actionButton(document, 'Reselect encoding', () =>
        actions.selectEncoding(book.id),
      ),
    );
  }
  if (!book.sourceMissing) {
    controls.append(
      actionButton(document, 'Relocate', () => actions.relocate(book.id)),
    );
  }
  controls.append(
    actionButton(document, 'Remove from bookshelf', () =>
      actions.remove(book.id),
    ),
  );
  card.append(controls);
  return card;
}

function actionButton(
  document: Document,
  label: string,
  action: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

export function displayPath(uri: string): string {
  try {
    const value = decodeURIComponent(uri.replace(/^file:\/\//i, ''));
    return value.replace(/^\/+([a-z]:)/i, '$1').replaceAll('/', '\\');
  } catch {
    return uri;
  }
}
