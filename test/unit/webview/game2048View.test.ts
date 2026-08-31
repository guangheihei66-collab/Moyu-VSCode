import { describe, expect, it, vi } from 'vitest';
import {
  Game2048Controller,
  type Game2048Transport,
} from '../../../webview/game2048/Game2048Controller';
import { Game2048View } from '../../../webview/game2048/Game2048View';
import type { Game2048State } from '../../../src/domain/game2048/types';

type TestEvent = { key: string; preventDefault: () => void };

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: TestEvent) => void>();
  textContent = '';
  ownerDocument!: TestDocument;
  parentElement: TestElement | null = null;
  tabIndex = -1;
  type = '';
  disabled = false;
  hidden = false;
  inert = false;
  className = '';
  constructor(readonly tagName: string) {}
  append(...children: TestElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
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
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  addEventListener(name: string, listener: (event: TestEvent) => void): void {
    this.listeners.set(name, listener);
  }
  click(): void {
    if (!this.disabled) {
      this.listeners.get('click')?.({
        key: '',
        preventDefault: () => undefined,
      });
    }
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
  querySelectorAll(selector: string): TestElement[] {
    const found: TestElement[] = [];
    const dataMatch = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        const isDataMatch =
          dataMatch !== null &&
          child.dataset[
            dataMatch[1]!.replace(/-([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            )
          ] !== undefined &&
          (dataMatch[2] === undefined ||
            child.dataset[
              dataMatch[1]!.replace(/-([a-z])/g, (_, letter: string) =>
                letter.toUpperCase(),
              )
            ] === dataMatch[2]);
        if (
          (selector === '[data-cell]' && child.dataset.cell !== undefined) ||
          (selector === 'button' && child.tagName === 'button') ||
          (selector === '[role="dialog"]' &&
            child.getAttribute('role') === 'dialog') ||
          (selector === '[data-game-dialog]' &&
            child.dataset.gameDialog !== undefined) ||
          isDataMatch
        ) {
          found.push(child);
        }
        visit(child);
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
    const element = new TestElement(tagName.toLowerCase());
    element.ownerDocument = this;
    return element;
  }
}
function state(): Game2048State {
  return {
    gameSessionId: 's',
    board: [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    score: 0,
    bestScore: 0,
    won: false,
    gameOver: false,
    moveSequence: 0,
    startedAt: 0,
    updatedAt: 0,
    stateVersion: 1,
  };
}
function transport(initial: Game2048State): Game2048Transport {
  return {
    load: vi.fn(async () => ({ version: 0, data: { state: initial } })),
    save: vi.fn(async (_version, next) => ({
      version: 1,
      data: { state: next },
    })),
    newGame: vi.fn(async (version) => ({
      version: version + 1,
      data: { state: initial },
    })),
  };
}

describe('2048 view/controller', () => {
  it('renders sixteen accessible cells and saves an active-board arrow move', async () => {
    const root = new TestElement('main');
    root.ownerDocument = new TestDocument();
    const client = transport(state());
    const controller = new Game2048Controller(client, () => 0);
    controller.mount(root as unknown as HTMLElement);
    await Promise.resolve();
    const board = root.querySelector('[data-game-board]')!;
    expect(board.querySelectorAll('[data-cell]')).toHaveLength(16);
    root.ownerDocument.activeElement = board;
    board.listeners.get('keydown')?.({
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    });
    await Promise.resolve();
    expect(client.save).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('renders compact stats, data-value cells, keyboard help, and labelled modal actions', () => {
    const root = new TestElement('main');
    root.ownerDocument = new TestDocument();
    const callbacks = {
      onMove: vi.fn(),
      onNewGame: vi.fn(),
      onContinue: vi.fn(),
    };
    const view = new Game2048View(root as unknown as HTMLElement, callbacks);
    view.render({ ...state(), score: 12, bestScore: 48, won: true });

    expect(root.querySelector('[data-game-score]')?.fullText).toContain(
      'Score',
    );
    expect(root.querySelector('[data-game-score-value]')?.textContent).toBe(
      '12',
    );
    expect(root.querySelector('[data-game-best-value]')?.textContent).toBe(
      '48',
    );
    expect(root.querySelector('[data-game-keyboard-help]')?.fullText).toContain(
      'Arrow',
    );
    expect(root.querySelectorAll('[data-cell]')).toHaveLength(16);
    expect(root.querySelector('[data-cell]')?.dataset.value).toBe('2');
    expect(root.querySelector('[data-game-dialog]')?.fullText).toContain(
      'You reached 2048',
    );
    expect(root.querySelector('[data-game-action="continue"]')).not.toBeNull();
    expect(root.querySelector('[data-game-action="new-game"]')).not.toBeNull();
    expect(callbacks.onMove).not.toHaveBeenCalled();
    view.dispose();
  });

  it('returns focus to the board after modal Continue and New Game actions', () => {
    const root = new TestElement('main');
    const document = new TestDocument();
    root.ownerDocument = document;
    const callbacks = {
      onMove: vi.fn(),
      onNewGame: vi.fn(),
      onContinue: vi.fn(),
    };
    const view = new Game2048View(root as unknown as HTMLElement, callbacks);
    view.render({ ...state(), won: true });
    const continueButton = root.querySelector('[data-game-action="continue"]')!;
    continueButton.click();
    expect(callbacks.onContinue).toHaveBeenCalledOnce();
    expect(document.activeElement?.getAttribute('data-game-board')).toBe(
      'true',
    );

    view.render({ ...state(), gameOver: true });
    root.querySelectorAll('[data-game-action="new-game"]').at(-1)?.click();
    expect(callbacks.onNewGame).toHaveBeenCalledOnce();
    expect(document.activeElement?.getAttribute('data-game-board')).toBe(
      'true',
    );
    view.dispose();
  });
});
