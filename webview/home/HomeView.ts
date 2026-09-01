import type {
  AppSection,
  HomeSnapshot,
  PresentationBook,
} from '../../src/shared/protocol/messages';
import { createButton } from '../components/Button';
import { createEmptyState } from '../components/EmptyState';
import { createProgress } from '../components/ProgressBar';
import { createSectionHeader } from '../components/SectionHeader';
import { createText } from '../components/dom';

export type HomeAction =
  | { type: 'navigate'; section: Extract<AppSection, 'books'> }
  | { type: 'continue'; bookId: string };

export class HomeView {
  private readonly document: Document;
  private readonly root: HTMLElement;
  private readonly onAction: (action: HomeAction) => void;

  constructor(root: HTMLElement, onAction: (action: HomeAction) => void) {
    this.root = root;
    this.document = root.ownerDocument;
    this.onAction = onAction;
  }

  render(snapshot: HomeSnapshot): void {
    const page = this.document.createElement('main');
    page.className = 'moyu-home';
    page.append(
      createSectionHeader(this.document, {
        title: 'Home',
        description: 'A quiet place to continue reading or browse your books.',
      }),
      this.renderContinue(snapshot),
      this.renderQuickAccess(snapshot),
      this.renderRecent(snapshot),
    );
    this.root.replaceChildren(page);
  }

  private renderContinue(snapshot: HomeSnapshot): HTMLElement {
    const section = this.document.createElement('section');
    section.className = 'moyu-home__section moyu-home__continue';
    section.append(createText(this.document, 'h2', 'Continue Reading'));
    const book = snapshot.continueReading;
    if (book === undefined) {
      section.append(
        createEmptyState(this.document, {
          title:
            snapshot.booksCount === 0
              ? 'Import your first book'
              : 'Open a book to start reading',
          description:
            snapshot.booksCount === 0
              ? 'Add a local TXT or EPUB book to begin.'
              : 'Choose a book from Books to create a reading checkpoint.',
          action: {
            label: 'Open Books',
            variant: 'primary',
            onClick: () => this.navigate('books'),
          },
        }),
      );
      const action = section.querySelector('button');
      action?.setAttribute('data-home-action', 'books');
      return section;
    }

    const card = this.document.createElement('article');
    card.className = 'moyu-home__continue-card';
    card.append(
      createText(this.document, 'h3', book.title),
      createText(
        this.document,
        'p',
        `${book.type.toUpperCase()} · ${book.percentage}%`,
      ),
      createProgress(this.document, {
        value: book.percentage,
        label: 'Reading progress',
      }),
    );
    if (book.chapterLabel !== undefined) {
      card.append(createText(this.document, 'p', book.chapterLabel));
    }
    const continueButton = createButton(this.document, {
      label: 'Continue',
      variant: 'primary',
      onClick: () => this.continueBook(book),
    });
    continueButton.setAttribute('data-home-action', `continue-${book.bookId}`);
    card.append(continueButton);
    section.append(card);
    return section;
  }

  private renderQuickAccess(snapshot: HomeSnapshot): HTMLElement {
    const section = this.document.createElement('section');
    section.className = 'moyu-home__section moyu-home__quick-access';
    section.append(createText(this.document, 'h2', 'Quick Access'));
    const actions = this.document.createElement('div');
    actions.className = 'moyu-home__quick-grid';
    const booksButton = createButton(this.document, {
      label: `Books · ${snapshot.booksCount} books`,
      variant: 'secondary',
      icon: 'books',
      onClick: () => this.navigate('books'),
    });
    booksButton.setAttribute('data-home-action', 'books');
    actions.append(booksButton);
    section.append(actions);
    return section;
  }

  private renderRecent(snapshot: HomeSnapshot): HTMLElement {
    const section = this.document.createElement('section');
    section.className = 'moyu-home__section moyu-home__recent';
    section.append(createText(this.document, 'h2', 'Recent Books'));
    const list = this.document.createElement('div');
    list.className = 'moyu-home__recent-list';
    for (const book of snapshot.recentBooks) {
      list.append(this.renderRecentBook(book));
    }
    if (snapshot.recentBooks.length === 0 && snapshot.booksCount > 0) {
      list.append(
        createText(this.document, 'p', 'No recently opened books yet.'),
      );
    }
    section.append(list);
    return section;
  }

  private renderRecentBook(book: PresentationBook): HTMLElement {
    const row = this.document.createElement('article');
    row.className = 'moyu-home__recent-row';
    row.append(
      createText(this.document, 'h3', book.title),
      createText(
        this.document,
        'p',
        `${book.type.toUpperCase()} · ${book.percentage}%`,
      ),
    );
    if (book.sourceMissing) {
      row.append(createText(this.document, 'p', 'Source unavailable'));
    }
    const button = createButton(this.document, {
      label: 'Continue',
      variant: 'quiet',
      disabled: book.sourceMissing,
      onClick: () => this.continueBook(book),
    });
    button.setAttribute('data-home-action', `continue-${book.bookId}`);
    row.append(button);
    return row;
  }

  private navigate(section: Extract<AppSection, 'books'>): void {
    this.onAction({ type: 'navigate', section });
  }

  private continueBook(book: PresentationBook): void {
    this.onAction({ type: 'continue', bookId: book.bookId });
  }
}
