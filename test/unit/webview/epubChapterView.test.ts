import { describe, expect, it, vi } from 'vitest';

import type {
  EpubChapterSummary,
  EpubChapterSnapshot,
} from '../../../src/shared/protocol/messages';
import {
  validateHostResponse,
  validateHostRequest,
} from '../../../src/shared/protocol/validate';
import { ChapterDrawer } from '../../../webview/reader/ChapterDrawer';
import { ReaderController } from '../../../webview/reader/ReaderController';

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

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  contains(candidate: ElementStub | null): boolean {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }

  remove(): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
    this.parentElement = null;
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
      if (selector === 'aside') return element.tagName === 'ASIDE';
      if (selector === 'button') return element.tagName === 'BUTTON';
      if (selector === 'img') return element.tagName === 'IMG';
      if (selector === 'script') return element.tagName === 'SCRIPT';
      if (selector === '[aria-current="true"]')
        return element.getAttribute('aria-current') === 'true';
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

const chapters: readonly EpubChapterSummary[] = [
  { chapterId: 'chapter-2', title: '<Chapter 2>', position: 0 },
  { chapterId: 'chapter-1', title: 'Chapter 1', position: 1 },
];

describe('EPUB chapter drawer', () => {
  it('renders ordered safe chapter buttons, current state, Escape close, and focus return', () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const trigger = document.createElement('button');
    root.append(trigger);
    const onSelect = vi.fn();
    const drawer = new ChapterDrawer(
      root as unknown as HTMLElement,
      trigger as unknown as HTMLButtonElement,
      onSelect,
    );

    drawer.open(chapters, 'chapter-1');

    const aside = root.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside?.fullText).toContain('<Chapter 2>');
    expect(
      aside?.querySelectorAll('[data-chapter-id]').map((item) => item.fullText),
    ).toEqual(['<Chapter 2>', 'Chapter 1']);
    expect(aside?.querySelector('[aria-current="true"]')?.fullText).toBe(
      'Chapter 1',
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    aside?.querySelector('[data-chapter-id="chapter-2"]')?.click();
    expect(onSelect).toHaveBeenCalledWith('chapter-2');

    aside?.dispatch('keydown', { key: 'Escape' });
    expect(root.querySelector('aside')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('renders EPUB text safely and preserves chapter locator boundaries', async () => {
    const document = new DocumentStub();
    const root = document.createElement('main');
    const chapterOne: EpubChapterSnapshot = {
      bookId: 'book-1',
      chapterId: 'chapter-1',
      title: 'Chapter 1',
      position: 0,
      contentFingerprint: 'fingerprint-1',
      paragraphs: ['<script>alert(1)</script>', 'First paragraph'],
    };
    const chapterTwo: EpubChapterSnapshot = {
      bookId: 'book-1',
      chapterId: 'chapter-2',
      title: 'Chapter 2',
      position: 1,
      contentFingerprint: 'fingerprint-2',
      paragraphs: ['Second paragraph'],
    };
    const transport = {
      open: vi.fn(async () => ({
        version: 7,
        anchor: null,
        title: 'EPUB book',
        type: 'epub' as const,
        percentage: 0,
      })),
      readBlocks: vi.fn(),
      listChapters: vi.fn(async () => ({
        bookId: 'book-1',
        chapters: [chapterOne, chapterTwo].map(
          ({ chapterId, title, position }) => ({
            chapterId,
            title,
            position,
          }),
        ),
      })),
      openChapter: vi.fn(async (_bookId: string, chapterId: string) =>
        chapterId === chapterOne.chapterId ? chapterOne : chapterTwo,
      ),
      navigateChapter: vi.fn(
        async (
          _bookId: string,
          _chapterId: string,
          direction: 'previous' | 'next',
        ) => (direction === 'next' ? chapterTwo : chapterOne),
      ),
      saveProgress: vi.fn(async (_bookId, _version, locator) => ({
        version: 8,
        locator,
      })),
    };
    const controller = new ReaderController(transport);
    controller.mount(root as unknown as HTMLElement);

    await controller.open('book-1');

    expect(root.fullText).toContain('EPUB book');
    expect(root.fullText).toContain('<script>alert(1)</script>');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    root.querySelector('[data-reader-paragraph-index="0"]')?.focus();
    expect(controller.captureLogicalAnchor()).toEqual({
      kind: 'epub',
      chapterId: 'chapter-1',
      paragraphIndex: 0,
      characterOffset: 0,
      contentFingerprint: 'fingerprint-1',
    });

    const trigger = root.querySelector('[data-reader-chapter-trigger]')!;
    trigger.click();
    await vi.waitFor(() => expect(root.querySelector('aside')).not.toBeNull());
    expect(root.querySelector('aside')?.fullText).toContain('Chapter 1');

    await controller.loadAfter();
    expect(transport.navigateChapter).toHaveBeenCalledWith(
      'book-1',
      'chapter-1',
      'next',
    );
    expect(root.fullText).toContain('Second paragraph');
    expect(root.querySelector('[data-reader-chapter]')?.fullText).toBe(
      'Chapter 2',
    );
    await controller.loadAfter();
    expect(transport.navigateChapter).toHaveBeenCalledTimes(1);

    root.querySelector('[data-reader-paragraph-index="0"]')?.focus();
    await controller.saveAnchor();
    expect(transport.saveProgress).toHaveBeenCalledWith(
      'book-1',
      7,
      expect.objectContaining({
        kind: 'epub',
        chapterId: 'chapter-2',
        paragraphIndex: 0,
      }),
    );
    controller.dispose();
  });

  it('accepts chapter request/response families and rejects malformed snapshots', () => {
    const request = validateHostRequest(
      {
        protocol: 1,
        id: 'request-chapters',
        sessionId: 'session-1',
        type: 'reader/listChapters',
        payload: { bookId: 'book-1' },
      },
      'session-1',
    );
    expect(request.ok).toBe(true);

    const snapshot: EpubChapterSnapshot = {
      bookId: 'book-1',
      chapterId: 'chapter-1',
      title: 'Chapter 1',
      position: 0,
      contentFingerprint: 'fingerprint-1',
      paragraphs: ['<p>inert</p>'],
    };
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'response-chapter',
        sessionId: 'session-1',
        type: 'reader/chapter',
        payload: { requestId: 'request-chapter', snapshot },
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateHostResponse({
        protocol: 1,
        id: 'response-invalid-chapter',
        sessionId: 'session-1',
        type: 'reader/chapter',
        payload: {
          requestId: 'request-chapter',
          snapshot: { ...snapshot, paragraphs: [123] },
        },
      }),
    ).toMatchObject({ ok: false });
  });
});
