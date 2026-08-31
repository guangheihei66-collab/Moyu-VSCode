import { describe, expect, it, vi } from 'vitest';
import { ReaderController } from '../../../webview/reader/ReaderController';
import { ReaderView } from '../../../webview/reader/ReaderView';
import type { ReaderBlock } from '../../../src/domain/reader/locator';
import type { ReaderPresentationModel } from '../../../webview/reader/readerModel';

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: unknown) => void>();
  ownerDocument!: TestDocument;
  parentElement: TestElement | null = null;
  className = '';
  disabled = false;
  hidden = false;
  type = '';
  value = '';
  textContent = '';
  tabIndex = -1;
  scrollTop = 0;
  clientHeight = 100;

  constructor(readonly tagName: string) {}

  append(...children: TestElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  prepend(...children: TestElement[]): void {
    for (const child of children) child.parentElement = this;
    this.children.unshift(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    this.append(...children);
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

  addEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string, listener: (event: unknown) => void): void {
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

  contains(candidate: TestElement | null): boolean {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  querySelectorAll(selector: string): TestElement[] {
    const found: TestElement[] = [];
    const matches = (element: TestElement): boolean => {
      if (selector === 'button') return element.tagName === 'BUTTON';
      if (selector === 'p') return element.tagName === 'P';
      if (selector === 'header') return element.tagName === 'HEADER';
      if (selector === 'img') return element.tagName === 'IMG';
      if (selector === '[data-block-id]')
        return element.dataset.blockId !== undefined;
      if (selector === '[data-reader-content]')
        return element.dataset.readerContent !== undefined;
      if (selector === '[data-reader-progress]')
        return element.dataset.readerProgress !== undefined;
      if (selector === '[data-reader-toolbar]')
        return element.dataset.readerToolbar !== undefined;
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
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        if (matches(child)) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join('')
    );
  }
}

class TestDocument {
  activeElement: TestElement | null = null;
  readonly body: TestElement;

  constructor() {
    this.body = this.createElement('body');
  }

  createElement(tagName: string): TestElement {
    const element = new TestElement(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }

  createDocumentFragment(): TestElement {
    return this.createElement('fragment');
  }
}

const block: ReaderBlock = {
  id: '1',
  paragraphs: ['<img src=x onerror=alert(1)>'],
  decodedLength: 30,
  contentFingerprint: 'fp-1',
};

describe('ReaderView', () => {
  it('renders untrusted paragraphs as text rather than HTML', () => {
    const root = new TestElement('MAIN');
    root.ownerDocument = new TestDocument();
    const view = new ReaderView(root as unknown as HTMLElement);

    view.renderBlocks([block]);

    expect(root.querySelector('img')).toBeNull();
    expect(root.fullText).toContain('<img src=x onerror=alert(1)>');
  });

  it('captures a logical anchor and keeps page movement independent of text size', () => {
    const root = new TestElement('MAIN');
    root.ownerDocument = new TestDocument();
    const view = new ReaderView(root as unknown as HTMLElement);
    view.renderBlocks([block]);
    const paragraph = root.querySelector('[data-block-id]')!;
    paragraph.focus();
    const controller = new ReaderController({
      readBlocks: vi.fn(),
      saveProgress: vi.fn(),
    });
    controller.mount(root as unknown as HTMLElement);

    expect(controller.captureAnchor()).toEqual({
      blockId: '1',
      characterOffset: 0,
    });
    controller.pageDown();
    expect(root.scrollTop).toBe(root.clientHeight);
    controller.pageUp();
    expect(root.scrollTop).toBe(0);
    controller.pause();
    expect(controller.isPaused).toBe(true);
    controller.resume();
    expect(controller.isPaused).toBe(false);
    controller.dispose();
  });

  it('retains a validated nonzero durable locator for a live focused block', async () => {
    const root = new TestElement('MAIN');
    root.ownerDocument = new TestDocument();
    const locator = {
      kind: 'txt' as const,
      blockId: '1',
      characterOffset: 9,
      contentFingerprint: 'fp-1',
    };
    const transport = {
      open: vi.fn(async () => ({
        version: 4,
        anchor: locator,
        title: 'Reader title',
        type: 'txt' as const,
        percentage: 47,
        chapterTitle: 'Chapter 12',
      })),
      readBlocks: vi.fn(async () => ({
        blocks: [block],
        atStart: true,
        atEnd: false,
      })),
      saveProgress: vi.fn(async () => ({ version: 5, locator })),
    };
    const controller = new ReaderController(transport);
    controller.mount(root as unknown as HTMLElement);

    await controller.open('reader-book');
    expect(root.fullText).toContain('Reader title');
    expect(root.fullText).toContain('TXT · 47%');
    expect(root.fullText).toContain('Chapter 12');
    expect(
      root.querySelector('[data-reader-action="previous"]')?.disabled,
    ).toBe(true);
    expect(root.querySelector('[data-reader-action="next"]')?.disabled).toBe(
      false,
    );
    root.querySelector('[data-block-id]')!.focus();
    expect(controller.captureLogicalAnchor()).toEqual(locator);

    await controller.saveAnchor();
    expect(transport.saveProgress).toHaveBeenCalledWith(
      'reader-book',
      4,
      locator,
    );
  });

  it('renders a safe presentation model with reader context and bounded content hooks', () => {
    const root = new TestElement('MAIN');
    root.ownerDocument = new TestDocument();
    const model: ReaderPresentationModel = {
      bookId: 'book-1',
      title: '<unsafe title>',
      type: 'txt',
      percentage: 47,
      chapterTitle: 'Chapter 12',
      paragraphs: ['<img src=x onerror=alert(1)>', 'Second paragraph'],
      atStart: false,
      atEnd: true,
    };
    const view = new ReaderView(root as unknown as HTMLElement);

    view.render(model);

    expect(root.querySelector('[data-reader-toolbar]')).not.toBeNull();
    expect(root.fullText).toContain('<unsafe title>');
    expect(root.fullText).toContain('Chapter 12');
    expect(root.fullText).toContain('47%');
    expect(root.fullText).toContain('<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[data-reader-content]')).not.toBeNull();
    expect(root.querySelector('[data-reader-progress]')).not.toBeNull();
    expect(root.querySelector('[data-reader-action="next"]')?.disabled).toBe(
      true,
    );
  });
});
