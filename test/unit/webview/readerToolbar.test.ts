import { describe, expect, it, vi } from 'vitest';

import { ReaderView } from '../../../webview/reader/ReaderView';
import type { ReaderPresentationModel } from '../../../webview/reader/readerModel';

type Listener = (event?: { key?: string; preventDefault?: () => void }) => void;

class ElementStub {
  readonly children: ElementStub[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener>();
  ownerDocument!: DocumentStub;
  parentElement: ElementStub | null = null;
  className = '';
  disabled = false;
  hidden = false;
  tabIndex = 0;
  textContent = '';
  type = '';

  constructor(readonly tagName: string) {}

  append(...items: ElementStub[]): void {
    for (const item of items) {
      item.parentElement = this;
      this.children.push(item);
    }
  }

  replaceChildren(...items: ElementStub[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    this.append(...items);
  }

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string, listener: Listener): void {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }

  dispatch(name: string, event: { key?: string } = {}): void {
    this.listeners.get(name)?.({ ...event, preventDefault: () => undefined });
  }

  click(): void {
    if (!this.disabled) this.dispatch('click');
  }

  remove(): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
    this.parentElement = null;
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string): ElementStub | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): ElementStub[] {
    const result: ElementStub[] = [];
    const matches = (element: ElementStub): boolean => {
      if (selector === 'button') return element.tagName === 'BUTTON';
      if (selector === '[role="menuitem"]')
        return element.getAttribute('role') === 'menuitem';
      const dataMatch = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (dataMatch?.[1] !== undefined) {
        const key = dataMatch[1].replace(/-([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        );
        const value = element.dataset[key];
        return (
          value !== undefined &&
          (dataMatch[2] === undefined || value === dataMatch[2])
        );
      }
      return false;
    };
    const visit = (element: ElementStub): void => {
      for (const child of element.children) {
        if (matches(child)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join(' ')
    );
  }
}

class DocumentStub {
  readonly body = new ElementStub('BODY');
  activeElement: ElementStub | null = null;

  constructor() {
    this.body.ownerDocument = this;
  }

  createElement(tagName: string): ElementStub {
    const element = new ElementStub(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

const model: ReaderPresentationModel = {
  bookId: 'book-1',
  title: 'A quiet book',
  type: 'txt',
  percentage: 47,
  paragraphs: ['One paragraph'],
  atStart: true,
  atEnd: false,
};

describe('Reader toolbar', () => {
  it('exposes Back, context, quiet overflow actions, and boundary-aware paging', () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const actions = {
      onBack: vi.fn(),
      onAction: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
    };
    const view = new ReaderView(root as unknown as HTMLElement, actions);

    view.render(model);

    root.querySelector('[data-reader-action="back"]')?.click();
    expect(actions.onBack).toHaveBeenCalledOnce();
    expect(root.fullText).toContain('A quiet book');
    expect(root.fullText).toContain('47%');
    expect(root.fullText).toContain('Reading settings');
    expect(root.fullText).toContain('Relocate file');
    expect(root.fullText).toContain('Book information');
    expect(
      root.querySelector('[data-reader-action="previous"]')?.disabled,
    ).toBe(true);
    expect(root.querySelector('[data-reader-action="next"]')?.disabled).toBe(
      false,
    );

    const menuTrigger = root.querySelector('[data-reader-menu]')!;
    menuTrigger.click();
    expect(menuTrigger.getAttribute('aria-expanded')).toBe('true');
    const settings = root
      .querySelectorAll('[role="menuitem"]')
      .find((item) => item.fullText === 'Reading settings');
    settings?.click();
    expect(actions.onAction).toHaveBeenCalledWith('settings');
    expect(document.activeElement).toBe(menuTrigger);

    root.querySelector('[data-reader-action="next"]')?.click();
    expect(actions.onNext).toHaveBeenCalledOnce();
    root.querySelector('[data-reader-action="previous"]')?.click();
    expect(actions.onPrevious).not.toHaveBeenCalled();
  });

  it('keeps toolbar quieting hooks in the DOM and restores them on focus/hover', () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const view = new ReaderView(root as unknown as HTMLElement);

    view.render(model);
    view.setQuiet(true);

    const toolbar = root.querySelector('[data-reader-toolbar]')!;
    const progress = root.querySelector('[data-reader-progress]')!;
    expect(toolbar.getAttribute('data-reader-quiet')).toBe('true');
    expect(progress.getAttribute('data-reader-quiet')).toBe('true');
    expect(toolbar.getAttribute('data-reader-quiet-on-interaction')).toBe(
      'true',
    );
    expect(progress.getAttribute('data-reader-quiet-on-interaction')).toBe(
      'true',
    );
  });
});
