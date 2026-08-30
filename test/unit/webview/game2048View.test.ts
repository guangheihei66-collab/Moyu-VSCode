import { describe, expect, it, vi } from 'vitest';
import {
  Game2048Controller,
  type Game2048Transport,
} from '../../../webview/game2048/Game2048Controller';
import type { Game2048State } from '../../../src/domain/game2048/types';

type TestEvent = { key: string; preventDefault: () => void };

class TestElement {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: TestEvent) => void>();
  textContent = '';
  ownerDocument!: TestDocument;
  tabIndex = -1;
  type = '';
  constructor(readonly tagName: string) {}
  append(...children: TestElement[]): void {
    this.children.push(...children);
  }
  replaceChildren(...children: TestElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(name: string, listener: (event: TestEvent) => void): void {
    this.listeners.set(name, listener);
  }
  remove(): void {
    /* the test tree does not need parent links */
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  querySelectorAll(selector: string): TestElement[] {
    const found: TestElement[] = [];
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        if (selector === '[data-cell]' && child.dataset.cell !== undefined)
          found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector: string): TestElement | null {
    return selector === '[data-game-dialog]' ? null : null;
  }
}
class TestDocument {
  activeElement: TestElement | null = null;
  createElement(tagName: string): TestElement {
    const element = new TestElement(tagName);
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
    const board = root.children[0]!.children.at(-1)!;
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
});
