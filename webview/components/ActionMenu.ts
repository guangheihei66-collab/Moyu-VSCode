import { createButton } from './Button';

export interface MenuItem {
  id: string;
  label: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export class ActionMenu {
  readonly menuElement: HTMLElement;
  private readonly document: Document;
  private anchor: HTMLButtonElement | undefined;
  private items: readonly MenuItem[] = [];
  private _itemElements: HTMLButtonElement[] = [];
  private activeIndex = -1;

  constructor(document: Document) {
    this.document = document;
    this.menuElement = document.createElement('div');
    this.menuElement.className = 'moyu-action-menu';
    this.menuElement.setAttribute('role', 'menu');
    this.menuElement.hidden = true;
    this.menuElement.addEventListener('keydown', this.handleMenuKeydown);
  }

  get itemElements(): readonly HTMLButtonElement[] {
    return this._itemElements;
  }

  get isOpen(): boolean {
    return !this.menuElement.hidden;
  }

  mount(anchor: HTMLButtonElement, items: readonly MenuItem[]): void {
    this.detachAnchor();
    this.menuElement.remove();
    this.anchor = anchor;
    this.items = items;
    this._itemElements = items.map((item) => {
      const button = createButton(this.document, {
        label: item.label,
        disabled: item.disabled,
        variant: 'quiet',
        onClick: () => {
          if (item.disabled) return;
          item.onSelect(item.id);
          this.close();
        },
      });
      button.className = 'moyu-action-menu__item';
      button.setAttribute('role', 'menuitem');
      button.setAttribute('data-menu-id', item.id);
      button.tabIndex = -1;
      return button;
    });
    this.menuElement.replaceChildren(...this._itemElements);
    this.menuElement.hidden = true;
    anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-expanded', 'false');
    anchor.addEventListener('click', this.handleAnchorClick);
    anchor.addEventListener('keydown', this.handleAnchorKeydown);
    (anchor.parentElement ?? this.document.body).append(this.menuElement);
  }

  open(): void {
    if (this.anchor === undefined || this._itemElements.length === 0) return;
    this.menuElement.hidden = false;
    this.anchor.setAttribute('aria-expanded', 'true');
    this.activeIndex = this.findEnabledIndex(0, 1);
    this.focusActiveItem();
  }

  close(): void {
    this.menuElement.hidden = true;
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.activeIndex = -1;
    this.anchor?.focus();
  }

  dispose(): void {
    this.detachAnchor();
    this.menuElement.removeEventListener('keydown', this.handleMenuKeydown);
    this.menuElement.remove();
    this._itemElements = [];
    this.items = [];
    this.anchor = undefined;
  }

  private readonly handleAnchorClick = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.isOpen) this.close();
    else this.open();
  };

  private readonly handleAnchorKeydown = (event: KeyboardEvent): void => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      this.open();
    }
  };

  private readonly handleMenuKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = this.findEnabledIndex(
        this.activeIndex + direction,
        direction,
      );
      this.focusActiveItem();
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const direction = event.key === 'Home' ? 1 : -1;
      const start = event.key === 'Home' ? 0 : this._itemElements.length - 1;
      this.activeIndex = this.findEnabledIndex(start, direction);
      this.focusActiveItem();
    }
  };

  private findEnabledIndex(start: number, direction: 1 | -1): number {
    const length = this._itemElements.length;
    if (length === 0) return -1;
    for (let offset = 0; offset < length; offset += 1) {
      const index = (start + offset * direction + length) % length;
      if (!this._itemElements[index]?.disabled) return index;
    }
    return -1;
  }

  private focusActiveItem(): void {
    const item = this._itemElements[this.activeIndex];
    item?.focus();
  }

  private detachAnchor(): void {
    if (this.anchor === undefined) return;
    this.anchor.removeEventListener('click', this.handleAnchorClick);
    this.anchor.removeEventListener('keydown', this.handleAnchorKeydown);
    this.anchor.removeAttribute('aria-haspopup');
    this.anchor.removeAttribute('aria-expanded');
  }
}
