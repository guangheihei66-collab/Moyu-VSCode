import {
  present,
  type PresentedError,
} from '../../src/extension/errorPresenter';
import {
  RECOVERY_ACTIONS,
  type RecoveryAction,
} from '../../src/domain/shared/errors';

export type RecoveryActionHandler = (action: RecoveryAction) => void;

const ACTION_LABELS: Record<RecoveryAction, string> = {
  relocate: 'Relocate',
  removeFromBookshelf: 'Remove from bookshelf',
  selectEncoding: 'Reselect Encoding',
  rebuildIndex: 'Rebuild Index',
  retry: 'Retry',
  reloadGame: 'Reload Game',
  startNewGame: 'Start New Game',
};

function isRecoveryAction(value: unknown): value is RecoveryAction {
  return (RECOVERY_ACTIONS as readonly unknown[]).includes(value);
}

function isPresentedError(value: unknown): value is PresentedError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PresentedError>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    Array.isArray(candidate.actions) &&
    candidate.actions.length <= RECOVERY_ACTIONS.length &&
    candidate.actions.every(isRecoveryAction)
  );
}

function createDocument(root: HTMLElement): Pick<Document, 'createElement'> {
  if (root.ownerDocument !== undefined) return root.ownerDocument;
  if (typeof document !== 'undefined') return document;

  // Unit tests can provide a DOM-shaped element without an ownerDocument.
  // Real Webview elements always take the first branch.
  const Constructor = (root as unknown as { constructor?: unknown })
    .constructor;
  if (typeof Constructor === 'function') {
    return {
      createElement(tagName: string): HTMLElement {
        return new (Constructor as new (name: string) => HTMLElement)(
          tagName.toUpperCase(),
        );
      },
    };
  }
  throw new Error('Error view requires a document.');
}

/** A safe, accessible error surface for bounded recovery actions. */
export class ErrorView {
  constructor(
    private readonly root: HTMLElement,
    private readonly onAction: RecoveryActionHandler = () => undefined,
  ) {}

  show(error: PresentedError | unknown): void {
    const displayed = isPresentedError(error) ? error : present(error);
    const document = createDocument(this.root);

    this.root.setAttribute('role', 'alert');
    this.root.setAttribute('aria-live', 'assertive');
    this.root.setAttribute('data-error-view', 'true');

    const heading = document.createElement('h2');
    heading.textContent = 'Moyu needs attention';
    const message = document.createElement('p');
    message.textContent = displayed.message;
    const actions = document.createElement('div');
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Recovery actions');
    actions.setAttribute('data-error-actions', 'true');

    for (const action of displayed.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = ACTION_LABELS[action];
      button.setAttribute('data-recovery-action', action);
      if (button.dataset !== undefined) button.dataset.recoveryAction = action;
      button.addEventListener('click', () => this.onAction(action));
      actions.append(button);
    }

    this.root.replaceChildren(heading, message, actions);
  }

  render(error: PresentedError | unknown): void {
    this.show(error);
  }

  clear(): void {
    this.root.replaceChildren();
  }

  hide(): void {
    this.clear();
  }
}
