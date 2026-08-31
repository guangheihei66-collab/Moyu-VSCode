import { describe, expect, it, vi } from 'vitest';

import { BossOverlay } from '../../../webview/boss/BossOverlay';
import {
  BOSS_PANEL_TITLES,
  BOSS_TEMPLATES,
} from '../../../webview/boss/templates';
import { createApp } from '../../../webview/shell/app';
import { ReaderController } from '../../../webview/reader/ReaderController';
import type {
  ModuleBinding,
  ModuleSnapshot,
} from '../../../webview/shell/moduleLifecycle';

const durableReaderAnchor = {
  kind: 'txt' as const,
  blockId: 'block-7',
  characterOffset: 9,
  contentFingerprint: 'block-fingerprint-7',
};
const durableGameState = {
  gameSessionId: 'durable-game-1',
  board: [
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  score: 12,
  bestScore: 12,
  won: false,
  gameOver: false,
  moveSequence: 3,
  startedAt: 1,
  updatedAt: 2,
  stateVersion: 1,
};

function productionModuleClient() {
  return {
    readSettings: async () => ({
      version: 0,
      settings: {
        fontSize: 18,
        lineHeight: 1.75,
        contentWidth: 760,
        bossTemplate: 'typescript' as const,
      },
    }),
    updateSettings: async () => ({
      version: 0,
      settings: {
        fontSize: 18,
        lineHeight: 1.75,
        contentWidth: 760,
        bossTemplate: 'typescript' as const,
      },
    }),
    open: async () => ({ version: 4, anchor: durableReaderAnchor }),
    readBlocks: async () => ({
      blocks: [
        {
          id: 'block-7',
          paragraphs: ['A durable reader paragraph.'],
          decodedLength: 40,
          contentFingerprint: 'block-fingerprint-7',
        },
      ],
      atStart: true,
      atEnd: true,
    }),
    saveProgress: async () => ({
      version: 5,
      locator: durableReaderAnchor,
    }),
    load: async () => ({ version: 6, data: { state: durableGameState } }),
    save: async () => ({ version: 7, data: { state: durableGameState } }),
    newGame: async () => ({ version: 7, data: { state: durableGameState } }),
  };
}

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly style = { setProperty: () => {} };
  ownerDocument!: TestDocument;
  hidden = false;
  inert = false;
  tabIndex = -1;
  type = '';
  scrollTop = 0;
  clientHeight = 100;
  textContent = '';
  readonly listeners = new Map<string, (event: unknown) => void>();

  constructor(readonly tagName: string) {}

  set innerHTML(_value: string) {
    throw new Error('Boss templates must never use innerHTML.');
  }

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, listener);
  }

  removeEventListener(name: string, listener: (event: unknown) => void): void {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }

  querySelectorAll(selector: string): TestElement[] {
    const matched: TestElement[] = [];
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        if (
          (selector === '[data-block-id]' &&
            child.dataset.blockId !== undefined) ||
          (selector === '[data-cell]' && child.dataset.cell !== undefined)
        ) {
          matched.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matched;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  focus(options?: FocusOptions): void {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.lastFocusOptions = options;
  }

  remove(): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
    this.parentElement = null;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join('')
    );
  }
}

class TestDocument {
  activeElement: TestElement | null = null;
  lastFocusOptions: FocusOptions | undefined;
  readonly documentElement: TestElement;
  readonly body: TestElement;

  constructor() {
    this.documentElement = this.createElement('html');
    this.body = this.createElement('body');
  }

  createElement(tagName: string): TestElement {
    const element = new TestElement(tagName.toUpperCase());
    element.ownerDocument = this;
    return element;
  }
}

function fixture(): {
  host: TestElement;
  normal: TestElement;
  overlay: BossOverlay;
} {
  const document = new TestDocument();
  const host = document.createElement('main');
  const normal = document.createElement('div');
  host.append(normal);
  return {
    host,
    normal,
    overlay: new BossOverlay(
      host as unknown as HTMLElement,
      normal as unknown as HTMLElement,
    ),
  };
}

describe('BossOverlay', () => {
  it.each(['typescript', 'json', 'buildLog'] as const)(
    'renders the local %s template only as text and maps its safe title',
    (template) => {
      const { host, overlay } = fixture();

      overlay.show(template);

      expect(host.children[1]?.fullText).toBe(BOSS_TEMPLATES[template]);
      expect(BOSS_PANEL_TITLES[template]).toBe(
        {
          typescript: 'extension.ts',
          json: 'settings.json',
          buildLog: 'build.log',
        }[template],
      );
    },
  );

  it('keeps one accessible overlay, makes normal content inert, and restores it on hide', () => {
    const { host, normal, overlay } = fixture();

    overlay.show('typescript');
    const persistentElement = host.children[1]!;
    expect(normal).toMatchObject({ hidden: true, inert: true });
    expect(normal.attributes.get('aria-hidden')).toBe('true');
    expect(persistentElement).toMatchObject({ hidden: false, tabIndex: -1 });
    expect(persistentElement.attributes.get('role')).toBe('document');
    expect(persistentElement.attributes.get('aria-label')).toBe(
      'Boss mode work preview',
    );
    expect(host.ownerDocument.activeElement).toBe(persistentElement);
    expect(host.ownerDocument.lastFocusOptions).toEqual({
      preventScroll: true,
    });

    overlay.show('json');
    expect(host.children[1]).toBe(persistentElement);

    overlay.hide();
    expect(normal).toMatchObject({ hidden: false, inert: false });
    expect(normal.attributes.has('aria-hidden')).toBe(false);
    expect(persistentElement.hidden).toBe(true);
  });

  it('preserves a populated Reader controller and nonzero logical focus through Boss mode', async () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const readerAnchor = {
      kind: 'txt' as const,
      blockId: 'block-7',
      characterOffset: 9,
      contentFingerprint: 'block-fingerprint-7',
    };
    const controller = new ReaderController({
      open: async () => ({ version: 4, anchor: readerAnchor }),
      readBlocks: async () => ({
        blocks: [
          {
            id: 'block-7',
            paragraphs: ['A durable reader paragraph.'],
            decodedLength: 40,
            contentFingerprint: 'block-fingerprint-7',
          },
        ],
        atStart: true,
        atEnd: false,
      }),
      saveProgress: async () => ({ version: 5, locator: readerAnchor }),
    });
    const binding: ModuleBinding = {
      id: 'reader:book-1',
      controller,
      pause: () => controller.pause(),
      resume: () => controller.resume(),
      captureFocus: () => controller.captureFocus(),
      restoreFocus: (focus) => controller.restoreFocus(focus as never),
      captureAnchor: () => controller.captureLogicalAnchor(),
      restoreAnchor: (anchor) =>
        controller.restoreLogicalAnchor(anchor as typeof readerAnchor),
      captureState: () => controller.captureState(),
    };
    const app = createApp(
      root as unknown as HTMLElement,
      productionModuleClient(),
      'reader',
      () => binding,
    );
    const normalRegion = root.children[0]!;
    controller.mount(normalRegion as unknown as HTMLElement);
    await controller.open('reader-book');
    normalRegion.querySelector('[data-block-id]')!.focus();
    const before = app.captureModuleSnapshot();

    app.setBossMode('BOSS_MODE', 'typescript');
    expect(app.isBossMode).toBe(true);
    expect(normalRegion).toMatchObject({ hidden: true, inert: true });
    expect(controller.isPaused).toBe(true);

    app.setBossMode('NORMAL', 'typescript');
    expect(app.isBossMode).toBe(false);
    expect(normalRegion).toMatchObject({ hidden: false, inert: false });
    const after = app.captureModuleSnapshot();
    expect(controller.isPaused).toBe(false);
    expect(after.controller).toBe(before.controller);
    expect(after.moduleState).toBe(before.moduleState);
    expect(after.logicalAnchor).toEqual(readerAnchor);
  });

  it('uses mounted production Reader and 2048 controllers without replacing their state objects', async () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const app = createApp(
      root as unknown as HTMLElement,
      productionModuleClient(),
      'reader',
    ) as unknown as {
      captureModuleSnapshot(): ModuleSnapshot;
      navigate(section: 'reader' | 'game2048'): boolean;
      setBossMode(mode: 'NORMAL' | 'BOSS_MODE', template: 'typescript'): void;
    };

    const readerBefore = app.captureModuleSnapshot();
    app.setBossMode('BOSS_MODE', 'typescript');
    app.setBossMode('NORMAL', 'typescript');
    const readerAfter = app.captureModuleSnapshot();
    expect(readerAfter.controller).toBe(readerBefore.controller);
    expect(readerAfter.moduleState).toBe(readerBefore.moduleState);

    expect(app.navigate('game2048')).toBe(true);
    await Promise.resolve();
    const gameBefore = app.captureModuleSnapshot();
    expect(
      (gameBefore.moduleState as { gameSessionId: string }).gameSessionId,
    ).toBe('durable-game-1');
    expect((gameBefore.moduleState as { board: unknown[] }).board[0]).toContain(
      2,
    );
    app.setBossMode('BOSS_MODE', 'typescript');
    app.setBossMode('NORMAL', 'typescript');
    const gameAfter = app.captureModuleSnapshot();
    expect(gameAfter.controller).toBe(gameBefore.controller);
    expect(gameAfter.moduleState).toBe(gameBefore.moduleState);
    expect((gameAfter.moduleState as { board: unknown }).board).toBe(
      (gameBefore.moduleState as { board: unknown }).board,
    );
  });

  it('captures and restores the production Reader logical anchor', async () => {
    const restoreLogicalAnchor = vi.spyOn(
      ReaderController.prototype,
      'restoreLogicalAnchor',
    );
    const document = new TestDocument();
    const root = document.createElement('main');
    const app = createApp(
      root as unknown as HTMLElement,
      productionModuleClient(),
      'reader',
    );
    const normalRegion = root.children[0]!;
    const controller = app.captureModuleSnapshot()
      .controller as ReaderController;

    await controller.open('reader-book');
    normalRegion.querySelector('[data-block-id]')!.focus();
    const before = app.captureModuleSnapshot();

    expect(before.logicalAnchor).toEqual(durableReaderAnchor);
    app.setBossMode('BOSS_MODE', 'typescript');
    app.setBossMode('NORMAL', 'typescript');

    expect(restoreLogicalAnchor).toHaveBeenCalledWith(durableReaderAnchor);
    restoreLogicalAnchor.mockRestore();
    app.dispose();
  });

  it('restores the stable shell module after a transient route change', () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const app = createApp(
      root as unknown as HTMLElement,
      productionModuleClient(),
      'settings',
    );
    const before = app.captureModuleSnapshot();

    app.setBossMode('BOSS_MODE', 'typescript');
    app.router.navigate('books');
    app.setBossMode('NORMAL', 'typescript');

    expect(app.router.current).toBe('settings');
    expect(app.captureModuleSnapshot().controller).toBe(before.controller);
    app.dispose();
  });

  it('defers navigation while Boss mode is active so the captured module cannot change', () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const app = createApp(
      root as unknown as HTMLElement,
      productionModuleClient(),
      'reader',
    ) as unknown as {
      captureModuleSnapshot(): ModuleSnapshot;
      navigate(section: 'game2048'): boolean;
      setBossMode(mode: 'NORMAL' | 'BOSS_MODE', template: 'typescript'): void;
    };
    const before = app.captureModuleSnapshot();

    app.setBossMode('BOSS_MODE', 'typescript');
    expect(app.navigate('game2048')).toBe(false);
    expect(app.captureModuleSnapshot().controller).toBe(before.controller);
    app.setBossMode('NORMAL', 'typescript');
  });
});
