import { describe, expect, it, vi } from 'vitest';

import { createButton } from '../../../webview/components/Button';
import { ActionMenu } from '../../../webview/components/ActionMenu';
import { createEmptyState } from '../../../webview/components/EmptyState';
import { createProgress } from '../../../webview/components/ProgressBar';
import { createSectionHeader } from '../../../webview/components/SectionHeader';
import { createText } from '../../../webview/components/dom';
import { Modal } from '../../../webview/components/Modal';

type Listener = (event: { key?: string; preventDefault(): void }) => void;

class TestElement {
  readonly children: TestElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener>();
  ownerDocument!: TestDocument;
  parentElement: TestElement | null = null;
  textContent = '';
  hidden = false;
  disabled = false;
  tabIndex = -1;

  constructor(readonly tagName: string) {}

  append(...children: TestElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: TestElement[]): void {
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  remove(): void {
    if (this.parentElement === null) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string): void {
    this.listeners.delete(name);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  click(): void {
    this.listeners.get('click')?.({ preventDefault() {} });
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    const found: TestElement[] = [];
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        if (
          selector === '[role="menuitem"]' &&
          child.getAttribute('role') === 'menuitem'
        ) {
          found.push(child);
        }
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

class TestDocument {
  readonly body: TestElement;
  activeElement: TestElement | null = null;

  constructor() {
    this.body = this.createElement('body');
  }

  createElement(tagName: string): TestElement {
    const element = new TestElement(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

describe('shared presentation components', () => {
  it('renders safe text and semantic controls without HTML interpolation', () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const onClick = vi.fn();

    const text = createText(document as unknown as Document, 'p', '<unsafe>');
    const button = createButton(document as unknown as Document, {
      label: '<open>',
      onClick,
      variant: 'primary',
    });
    const heading = createSectionHeader(document as unknown as Document, {
      title: '<section>',
      description: '<description>',
    });
    const empty = createEmptyState(document as unknown as Document, {
      title: 'Nothing here',
      description: 'Import a book to begin.',
    });

    root.append(
      text as unknown as TestElement,
      button as unknown as TestElement,
      heading as unknown as TestElement,
      empty as unknown as TestElement,
    );
    (button as unknown as TestElement).click();

    expect(text.textContent).toBe('<unsafe>');
    expect((button as unknown as TestElement).tagName).toBe('BUTTON');
    expect((button as unknown as TestElement).getAttribute('type')).toBe(
      'button',
    );
    expect((button as unknown as TestElement).fullText).toBe('<open>');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((heading as unknown as TestElement).fullText).toContain('<section>');
    expect((empty as unknown as TestElement).fullText).toContain(
      'Import a book to begin.',
    );
  });

  it('clamps progress and exposes a text fallback', () => {
    const document = new TestDocument();
    const progress = createProgress(document as unknown as Document, {
      value: 140,
      label: 'Reading progress',
    }) as unknown as TestElement;

    expect(progress.getAttribute('role')).toBe('progressbar');
    expect(progress.getAttribute('aria-valuenow')).toBe('100');
    expect(progress.getAttribute('aria-label')).toBe('Reading progress');
    expect(progress.fullText).toContain('100%');
  });

  it('owns menu keyboard behavior and returns focus to its trigger', () => {
    const document = new TestDocument();
    const anchor = createButton(document as unknown as Document, {
      label: 'More',
    }) as unknown as TestElement;
    document.body.append(anchor);
    const onSelect = vi.fn();
    const menu = new ActionMenu(document as unknown as Document);

    menu.mount(anchor as unknown as HTMLButtonElement, [
      { id: 'open', label: 'Open', onSelect },
      { id: 'remove', label: 'Remove', onSelect },
    ]);
    menu.open();

    expect(menu.menuElement.hidden).toBe(false);
    expect(document.activeElement).toBe(menu.itemElements[0]);
    menu.itemElements[1]?.click();
    expect(onSelect).toHaveBeenCalledWith('remove');

    menu.menuElement.listeners.get('keydown')?.({
      key: 'Escape',
      preventDefault() {},
    });
    expect(menu.menuElement.hidden).toBe(true);
    expect(document.activeElement).toBe(anchor);
    menu.dispose();
  });

  it('opens an accessible modal and closes on Escape with focus return', () => {
    const document = new TestDocument();
    const trigger = createButton(document as unknown as Document, {
      label: 'Open dialog',
    }) as unknown as TestElement;
    document.body.append(trigger);
    const modal = new Modal(
      document as unknown as Document,
      document.body as unknown as HTMLElement,
    );

    modal.open({
      title: '<dialog title>',
      content: '<dialog content>',
      returnFocus: trigger as unknown as HTMLButtonElement,
    });

    expect(modal.dialogElement.getAttribute('role')).toBe('dialog');
    expect(modal.dialogElement.getAttribute('aria-modal')).toBe('true');
    expect(modal.dialogElement.fullText).toContain('<dialog content>');
    modal.dialogElement.listeners.get('keydown')?.({
      key: 'Escape',
      preventDefault() {},
    });
    expect(modal.isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
