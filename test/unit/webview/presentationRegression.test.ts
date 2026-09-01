import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_READER_SETTINGS,
  type ReaderSettings,
  type ReaderSettingsPatch,
} from '../../../src/domain/reader/settings';
import type {
  AppSection,
  BookshelfSnapshot,
  HomeSnapshot,
  LogicalLocator,
} from '../../../src/shared/protocol/messages';
import { PanelRegistry } from '../../../src/extension/panel/PanelRegistry';
import { createApp } from '../../../webview/shell/app';
import { SidebarView } from '../../../webview/sidebar/SidebarView';

type StubEvent = {
  key?: string;
  preventDefault(): void;
};
type StubListener = (event: StubEvent) => void;

class StyleStub {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class PresentationElement {
  readonly children: PresentationElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<StubListener>>();
  readonly dataset: Record<string, string> = {};
  readonly style = new StyleStub();
  ownerDocument!: PresentationDocument;
  parentElement: PresentationElement | null = null;
  className = '';
  disabled = false;
  hidden = false;
  inert = false;
  id = '';
  max = '';
  min = '';
  placeholder = '';
  selected = false;
  step = '';
  tabIndex = -1;
  textContent = '';
  type = '';
  value = '';
  scrollTop = 0;
  clientHeight = 100;

  constructor(readonly tagName: string) {}

  append(...items: PresentationElement[]): void {
    for (const item of items) {
      item.parentElement?.removeChild(item);
      item.parentElement = this;
      this.children.push(item);
    }
  }

  replaceChildren(...items: PresentationElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    this.append(...items);
  }

  removeChild(item: PresentationElement): void {
    const index = this.children.indexOf(item);
    if (index < 0) return;
    this.children.splice(index, 1);
    item.parentElement = null;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'class') this.className = value;
    if (name === 'id') this.id = value;
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name: string, listener: StubListener): void {
    const listeners = this.listeners.get(name) ?? new Set<StubListener>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: StubListener): void {
    const listeners = this.listeners.get(name);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.listeners.delete(name);
  }

  dispatch(name: string, event: Partial<StubEvent> = {}): void {
    const actual: StubEvent = {
      preventDefault: () => undefined,
      ...event,
    };
    for (const listener of this.listeners.get(name) ?? []) listener(actual);
  }

  click(): void {
    if (this.disabled) return;
    this.focus();
    this.dispatch('click');
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  contains(candidate: PresentationElement | null): boolean {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }

  querySelector<T extends PresentationElement = PresentationElement>(
    selector: string,
  ): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T extends PresentationElement = PresentationElement>(
    selector: string,
  ): T[] {
    const found: PresentationElement[] = [];
    const visit = (element: PresentationElement): void => {
      for (const child of element.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found as T[];
  }

  private matches(selector: string): boolean {
    if (selector === '*') return true;
    if (/^[a-z]+$/i.test(selector))
      return this.tagName === selector.toUpperCase();
    if (selector.startsWith('.'))
      return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const role = /^\[role=["']([^"']+)["']\]$/.exec(selector);
    if (role !== null) return this.getAttribute('role') === role[1];
    const attribute = /^\[([^=\]]+)(?:=["']([^"']*)["'])?\]$/.exec(selector);
    if (attribute === null) return false;
    const actual = this.getAttribute(attribute[1]!);
    return (
      actual !== null && (attribute[2] === undefined || actual === attribute[2])
    );
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join('')
    );
  }
}

class PresentationDocument {
  readonly documentElement: PresentationElement;
  readonly body: PresentationElement;
  activeElement: PresentationElement | null = null;

  constructor() {
    this.documentElement = this.createElement('html');
    this.body = this.createElement('body');
    this.documentElement.append(this.body);
  }

  createElement(tagName: string): PresentationElement {
    const element = new PresentationElement(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

const ROUTES: readonly AppSection[] = ['home', 'books', 'reader', 'settings'];

const SIDEBAR_ROUTES: readonly AppSection[] = ['home', 'books', 'settings'];

const SURFACES: Readonly<Record<AppSection, string>> = {
  home: '.moyu-home',
  books: '.moyu-bookshelf',
  reader: '.moyu-reader',
  settings: '.moyu-settings',
};

const epubAnchor: LogicalLocator = {
  kind: 'epub',
  chapterId: 'chapter-1',
  paragraphIndex: 0,
  characterOffset: 3,
  contentFingerprint: 'chapter-fingerprint-1',
};

function createClient() {
  let settingsVersion = 9;
  let settings: ReaderSettings = { ...DEFAULT_READER_SETTINGS };
  const books: BookshelfSnapshot = {
    version: 4,
    books: [
      {
        bookId: 'book-1',
        title: 'Regression EPUB',
        type: 'epub',
        percentage: 25,
        lastOpenedAt: 1,
        sourceMissing: false,
        chapterLabel: 'Chapter 1',
      },
    ],
  };
  const home: HomeSnapshot = {
    continueReading: books.books[0],
    recentBooks: books.books,
    booksCount: 1,
  };
  const chapter = (chapterId: string, position: number) => ({
    bookId: 'book-1',
    chapterId,
    title: `Chapter ${position + 1}`,
    position,
    contentFingerprint: `chapter-fingerprint-${position + 1}`,
    paragraphs: [`Readable text for chapter ${position + 1}.`],
  });

  return {
    open: vi.fn(async (bookId: string) => ({
      version: 6,
      anchor: epubAnchor,
      title: `Opened ${bookId}`,
      type: 'epub' as const,
      percentage: 25,
      chapterTitle: 'Chapter 1',
    })),
    readBlocks: vi.fn(async () => ({
      blocks: [],
      atStart: true,
      atEnd: true,
    })),
    saveProgress: vi.fn(
      async (
        _bookId: string,
        _baseVersion: number,
        locator: LogicalLocator,
      ) => ({
        version: 7,
        locator,
      }),
    ),
    listChapters: vi.fn(async () => ({
      bookId: 'book-1',
      chapters: [
        { chapterId: 'chapter-1', title: 'Chapter 1', position: 0 },
        { chapterId: 'chapter-2', title: 'Chapter 2', position: 1 },
      ],
    })),
    openChapter: vi.fn(async (_bookId: string, chapterId: string) =>
      chapter(chapterId, chapterId === 'chapter-1' ? 0 : 1),
    ),
    navigateChapter: vi.fn(async () => chapter('chapter-2', 1)),
    readSettings: vi.fn(async () => ({
      version: settingsVersion,
      settings,
    })),
    updateSettings: vi.fn(
      async (_baseVersion: number, patch: ReaderSettingsPatch) => {
        settings = { ...settings, ...patch };
        settingsVersion += 1;
        return { version: settingsVersion, settings };
      },
    ),
    readHome: vi.fn(async () => home),
    readBooks: vi.fn(async () => books),
    importBook: vi.fn(async () => books),
    relocateBook: vi.fn(async () => books),
    selectBookEncoding: vi.fn(async () => books),
    removeBook: vi.fn(async () => books),
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function expectOnlySurface(root: PresentationElement, route: AppSection): void {
  const normalRegion = root.querySelector('[data-normal-region]')!;
  for (const candidate of ROUTES) {
    const className = SURFACES[candidate].slice(1);
    const childCount = normalRegion.children.filter((child) =>
      child.className.split(/\s+/).includes(className),
    ).length;
    const regionCount = normalRegion.className.split(/\s+/).includes(className)
      ? 1
      : 0;
    const count = childCount + regionCount;
    expect(count, `${route} -> ${candidate}`).toBe(candidate === route ? 1 : 0);
  }
}

describe('integrated Moyu presentation regression', () => {
  it('mounts every restored-panel route once and preserves controller/module identity', async () => {
    const document = new PresentationDocument();
    const root = document.createElement('div');
    const client = createClient();
    const app = createApp(root as unknown as HTMLElement, client, 'settings');
    await flush();

    const snapshots = new Map<
      AppSection,
      ReturnType<typeof app.captureModuleSnapshot>
    >();
    for (const route of ROUTES) {
      expect(app.navigate(route)).toBe(true);
      await flush();
      expect(app.router.current).toBe(route);
      expectOnlySurface(root, route);
      snapshots.set(route, app.captureModuleSnapshot());
    }

    const fontInput = root.querySelector('#font-size')!;
    const fontOutput = root.querySelector('#font-size-value')!;
    fontInput.value = '20';
    fontInput.dispatch('input');
    expect(fontOutput.textContent).toBe('20 px');
    fontInput.dispatch('change');
    await flush();
    expect(client.updateSettings).toHaveBeenCalledWith(9, { fontSize: 20 });

    for (const route of ROUTES) {
      expect(app.navigate(route)).toBe(true);
      await flush();
      const previous = snapshots.get(route)!;
      const current = app.captureModuleSnapshot();
      expect(current.controller).toBe(previous.controller);
      expect(current.moduleState).toBe(previous.moduleState);
      expectOnlySurface(root, route);
    }
    expect(client.readHome).toHaveBeenCalled();
    expect(client.readBooks).toHaveBeenCalled();
    expect(client.readSettings).toHaveBeenCalled();

    app.dispose();
    expect(root.children).toHaveLength(0);
  });

  it('preserves EPUB logical anchors while Boss pauses the active surface', async () => {
    const document = new PresentationDocument();
    const root = document.createElement('div');
    const client = createClient();
    const app = createApp(root as unknown as HTMLElement, client, 'books');
    await flush();

    root.querySelector('[data-book-action="open-book-1"]')?.click();
    await flush();
    const paragraph = root.querySelector('[data-block-id="chapter-1"]');
    expect(paragraph).not.toBeNull();
    paragraph?.focus();
    const readerBefore = app.captureModuleSnapshot();
    expect(readerBefore.route).toBe('reader');
    expect(readerBefore.moduleId).toBe('reader');
    expect(readerBefore.logicalAnchor).toEqual(epubAnchor);

    root.querySelector('[data-reader-chapter-trigger]')?.click();
    await flush();
    expect(root.querySelector('[data-chapter-drawer]')).not.toBeNull();
    paragraph?.focus();

    const normalRegion = root.querySelector('[data-normal-region]')!;
    const overlay = root.querySelector('[data-boss-overlay]')!;
    app.setBossMode('BOSS_MODE', 'typescript');
    expect(app.isBossMode).toBe(true);
    expect(normalRegion.inert).toBe(true);
    expect(normalRegion.hidden).toBe(true);
    expect(normalRegion.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[data-chapter-drawer]')).toBeNull();
    expect(overlay.hidden).toBe(false);

    app.setBossMode('NORMAL', 'typescript');
    const readerAfter = app.captureModuleSnapshot();
    expect(app.isBossMode).toBe(false);
    expect(readerAfter.controller).toBe(readerBefore.controller);
    expect(readerAfter.moduleState).toBe(readerBefore.moduleState);
    expect(readerAfter.logicalAnchor).toEqual(readerBefore.logicalAnchor);
    expect(normalRegion.inert).toBe(false);
    expect(normalRegion.hidden).toBe(false);
    expect(normalRegion.getAttribute('aria-hidden')).toBeNull();

    const menu = root.querySelector('[role="menu"]');
    root.querySelector('[data-reader-menu]')?.click();
    expect(menu ?? root.querySelector('[role="menu"]')).not.toBeNull();
    const openMenu = root.querySelector('[role="menu"]')!;
    expect(openMenu.hidden).toBe(false);
    app.setBossMode('BOSS_MODE', 'json');
    app.setBossMode('NORMAL', 'json');
    expect(root.querySelector('[role="menu"]')).toBe(openMenu);
    expect(openMenu.hidden).toBe(false);

    app.dispose();
    expect(root.children).toHaveLength(0);
  });

  it('routes all Sidebar destinations through one panel and keeps manifest/runtime IDs exact', async () => {
    const document = new PresentationDocument();
    const sidebarRoot = document.createElement('div');
    const selected: AppSection[] = [];
    const panel = { open: vi.fn(), isVisible: true };
    let panelCount = 0;
    const registry = new PanelRegistry(
      () => {
        panelCount += 1;
        return panel as never;
      },
      { set: vi.fn(), clear: vi.fn() } as never,
    );
    const sidebar = new SidebarView(
      sidebarRoot as unknown as HTMLElement,
      (message) => {
        selected.push(message.section);
        void registry.openOrReveal('regression-window', message.section);
      },
    );
    sidebar.render({ active: 'home', booksCount: 1 });
    for (const route of SIDEBAR_ROUTES) {
      sidebarRoot.querySelector(`[data-sidebar-section="${route}"]`)?.click();
      await flush();
    }
    expect(selected).toEqual(SIDEBAR_ROUTES);
    expect(panelCount).toBe(1);
    expect(panel.open).toHaveBeenCalledTimes(SIDEBAR_ROUTES.length);
    expect(panel.open.mock.calls.map(([route]) => route)).toEqual(
      SIDEBAR_ROUTES,
    );

    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      contributes: {
        views: Record<string, { id: string; type?: string }[]>;
      };
    };
    const declared = manifest.contributes.views.moyu[0];
    const activation = readFileSync(
      resolve(process.cwd(), 'src/extension/activation.ts'),
      'utf8',
    );
    const runtimeId = /registerWebviewViewProvider\(\s*['"]([^'"]+)['"]/.exec(
      activation,
    )?.[1];
    expect(declared).toEqual({
      id: 'moyu.sidebar',
      name: 'Moyu',
      type: 'webview',
    });
    expect(runtimeId).toBe(declared?.id);
  });
});
