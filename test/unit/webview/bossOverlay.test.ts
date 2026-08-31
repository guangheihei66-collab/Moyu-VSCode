import { describe, expect, it, vi } from 'vitest';

import { BossOverlay } from '../../../webview/boss/BossOverlay';
import {
  BOSS_PANEL_TITLES,
  BOSS_TEMPLATES,
} from '../../../webview/boss/templates';
import { createApp } from '../../../webview/shell/app';
import type {
  ModuleBinding,
  ModuleSnapshot,
} from '../../../webview/shell/moduleLifecycle';

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
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
    void selector;
    return null;
  }

  focus(options?: FocusOptions): void {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.lastFocusOptions = options;
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

  it('integrates with the app without replacing the active module controller', () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const controller = { kind: 'reader' };
    const pause = vi.fn();
    const resume = vi.fn();
    const binding: ModuleBinding = {
      id: 'reader:book-1',
      controller,
      pause,
      resume,
      captureFocus: () => 'paragraph:block-9',
      restoreFocus: vi.fn(),
      captureAnchor: () => 'block-9',
      restoreAnchor: vi.fn(),
      captureState: () => controller,
    };
    const app = createApp(
      root as unknown as HTMLElement,
      undefined,
      'reader',
      () => binding,
    );
    const normalRegion = root.children[0]!;

    app.setBossMode('BOSS_MODE', 'typescript');
    expect(app.isBossMode).toBe(true);
    expect(normalRegion).toMatchObject({ hidden: true, inert: true });
    expect(pause).toHaveBeenCalledOnce();

    app.setBossMode('NORMAL', 'typescript');
    expect(app.isBossMode).toBe(false);
    expect(normalRegion).toMatchObject({ hidden: false, inert: false });
    expect(resume).toHaveBeenCalledOnce();
    expect(binding.controller).toBe(controller);
  });

  it('uses mounted production Reader and 2048 controllers without replacing their state objects', async () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const app = createApp(
      root as unknown as HTMLElement,
      undefined,
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
    app.setBossMode('BOSS_MODE', 'typescript');
    app.setBossMode('NORMAL', 'typescript');
    const gameAfter = app.captureModuleSnapshot();
    expect(gameAfter.controller).toBe(gameBefore.controller);
    expect(gameAfter.moduleState).toBe(gameBefore.moduleState);
    expect((gameAfter.moduleState as { board: unknown }).board).toBe(
      (gameBefore.moduleState as { board: unknown }).board,
    );
  });

  it('defers navigation while Boss mode is active so the captured module cannot change', () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const app = createApp(
      root as unknown as HTMLElement,
      undefined,
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
