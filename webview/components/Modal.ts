import { createButton } from './Button';
import { createText } from './dom';

export interface ModalOptions {
  title: string;
  content: string;
  description?: string;
  returnFocus?: HTMLElement;
  closeLabel?: string;
  onClose?: () => void;
}

export class Modal {
  readonly dialogElement: HTMLElement;
  private readonly document: Document;
  private readonly host: HTMLElement;
  private returnFocus: HTMLElement | undefined;
  private onClose: (() => void) | undefined;
  private openState = false;

  constructor(document: Document, host: HTMLElement) {
    this.document = document;
    this.host = host;
    this.dialogElement = document.createElement('div');
    this.dialogElement.className = 'moyu-modal';
    this.dialogElement.setAttribute('role', 'dialog');
    this.dialogElement.setAttribute('aria-modal', 'true');
    this.dialogElement.addEventListener('keydown', this.handleKeydown);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(options: ModalOptions): void {
    if (this.openState) this.close();
    this.returnFocus = options.returnFocus;
    this.onClose = options.onClose;
    this.dialogElement.replaceChildren();

    const title = createText(this.document, 'h2', options.title);
    title.id = 'moyu-modal-title';
    this.dialogElement.setAttribute('aria-labelledby', title.id);
    const close = createButton(this.document, {
      label: options.closeLabel ?? 'Close',
      icon: 'close',
      variant: 'quiet',
      title: options.closeLabel ?? 'Close',
      onClick: () => this.close(),
    });
    close.className = 'moyu-modal__close';
    const header = this.document.createElement('header');
    header.className = 'moyu-modal__header';
    header.append(title, close);

    const body = this.document.createElement('div');
    body.className = 'moyu-modal__body';
    if (options.description !== undefined) {
      body.append(createText(this.document, 'p', options.description));
    }
    body.append(createText(this.document, 'div', options.content));
    this.dialogElement.append(header, body);
    this.host.append(this.dialogElement);
    this.dialogElement.hidden = false;
    this.openState = true;
    close.focus();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.dialogElement.hidden = true;
    this.dialogElement.remove();
    this.returnFocus?.focus();
    const onClose = this.onClose;
    this.onClose = undefined;
    onClose?.();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };
}
