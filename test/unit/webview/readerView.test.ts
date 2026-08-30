import { describe, expect, it, vi } from 'vitest';
import { ReaderController } from '../../../webview/reader/ReaderController';
import { ReaderView } from '../../../webview/reader/ReaderView';
import type { ReaderBlock } from '../../../src/domain/reader/locator';

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: unknown) => void>();
  ownerDocument!: TestDocument;
  textContent = '';
  tabIndex = -1;
  hidden = false;
  scrollTop = 0;
  clientHeight = 100;

  constructor(readonly tagName: string) {}

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  prepend(...children: TestElement[]): void {
    this.children.unshift(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string): void {
    this.listeners.delete(name);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  querySelectorAll(selector: string): TestElement[] {
    const found: TestElement[] = [];
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        if (
          (selector === '[data-block-id]' &&
            child.dataset.blockId !== undefined) ||
          (selector === 'img' && child.tagName === 'IMG')
        )
          found.push(child);
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
});
