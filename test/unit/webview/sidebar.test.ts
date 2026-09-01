import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { SidebarView } from '../../../webview/sidebar/SidebarView';
import type { SidebarMessage } from '../../../src/shared/protocol/messages';

class ElementStub {
  readonly children: ElementStub[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  ownerDocument!: DocumentStub;
  parentElement: ElementStub | null = null;
  textContent = '';
  tabIndex = -1;

  constructor(readonly tagName: string) {}

  append(...items: ElementStub[]): void {
    for (const item of items) {
      item.parentElement = this;
      this.children.push(item);
    }
  }

  replaceChildren(...items: ElementStub[]): void {
    this.children.splice(0, this.children.length);
    this.append(...items);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  click(): void {
    this.listeners.get('click')?.();
  }

  querySelectorAll(selector: string): ElementStub[] {
    const found: ElementStub[] = [];
    const matches = (element: ElementStub): boolean => {
      if (selector === 'button') return element.tagName === 'BUTTON';
      if (selector === '[aria-current="page"]') {
        return element.getAttribute('aria-current') === 'page';
      }
      const dataMatch = /^\[data-sidebar-section="([^"]+)"\]$/.exec(selector);
      return dataMatch?.[1] === element.getAttribute('data-sidebar-section');
    };
    const visit = (element: ElementStub): void => {
      for (const child of element.children) {
        if (matches(child)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector: string): ElementStub | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join('')
    );
  }
}

class DocumentStub {
  activeElement: ElementStub | null = null;

  createElement(tagName: string): ElementStub {
    const element = new ElementStub(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

describe('SidebarView', () => {
  it('renders three typed navigation entries with summary and selected state', () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const messages: SidebarMessage[] = [];
    const view = new SidebarView(root as unknown as HTMLElement, (message) =>
      messages.push(message),
    );

    view.render({ active: 'books', booksCount: 3 });

    const buttons = root.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect(root.fullText).toContain('Home');
    expect(root.fullText).toContain('Books');
    expect(root.fullText).toContain('Settings');
    expect(root.fullText).toContain('3 books');
    expect(root.fullText).not.toContain('Best');
    expect(
      root
        .querySelector('[aria-current="page"]')
        ?.getAttribute('data-sidebar-section'),
    ).toBe('books');

    root.querySelector('[data-sidebar-section="settings"]')?.click();
    expect(messages).toEqual([{ type: 'navigate', section: 'settings' }]);
    view.focusActive();
    expect(document.activeElement?.getAttribute('data-sidebar-section')).toBe(
      'books',
    );
  });

  it('keeps navigation focusable and uses theme-aware hover/focus/selection CSS', async () => {
    const css = await readFile('webview/sidebar/sidebar.css', 'utf8');

    expect(css).toContain('.moyu-sidebar__entry:hover');
    expect(css).toContain('.moyu-sidebar__entry:focus-visible');
    expect(css).toContain("[aria-current='page']");
    expect(css).toContain('--vscode-list-activeSelectionBackground');
    expect(css).toContain('--vscode-focusBorder');
  });
});
