import type { Game2048State } from '../../src/domain/game2048/types';
import { createButton } from '../components/Button';
import { Modal } from '../components/Modal';
import { createText } from '../components/dom';

type ViewDirection = 'left' | 'right' | 'up' | 'down';
export type Game2048ViewCallbacks = {
  onMove: (direction: ViewDirection) => void;
  onNewGame: () => void;
  onContinue: () => void;
};

export class Game2048View {
  private readonly document: Document;
  private readonly section: HTMLElement;
  private readonly board: HTMLElement;
  private readonly score: HTMLElement;
  private readonly bestScore: HTMLElement;
  private readonly status: HTMLElement;
  private readonly newGameButton: HTMLButtonElement;
  private readonly cells: HTMLElement[] = [];
  private readonly callbacks: Game2048ViewCallbacks;
  private readonly modal: Modal;
  private continueAfterWin = false;
  private renderedSessionId: string | undefined;

  constructor(
    private readonly root: HTMLElement,
    callbacks: Game2048ViewCallbacks,
  ) {
    this.document = root.ownerDocument ?? document;
    this.callbacks = callbacks;
    this.section = this.document.createElement('section');
    this.section.className = 'moyu-game2048';
    this.section.setAttribute('data-game-root', 'true');
    this.section.setAttribute('data-game-layout', 'responsive');
    this.section.setAttribute('aria-label', '2048 game');
    const heading = this.document.createElement('h1');
    heading.textContent = '2048';
    heading.setAttribute('data-game-title', 'true');
    const scores = this.document.createElement('div');
    scores.className = 'moyu-game2048__stats';
    scores.setAttribute('data-game-stats', 'true');
    scores.setAttribute('aria-label', 'Scores');
    this.score = this.document.createElement('span');
    this.score.className = 'moyu-game2048__value';
    this.score.setAttribute('data-game-score-value', 'true');
    this.bestScore = this.document.createElement('span');
    this.bestScore.className = 'moyu-game2048__value';
    this.bestScore.setAttribute('data-game-best-value', 'true');
    scores.append(
      this.statBlock('Score', this.score, 'data-game-score'),
      this.statBlock('Best', this.bestScore, 'data-game-best'),
    );
    const keyboardHelp = createText(
      this.document,
      'p',
      'Use Arrow keys or W A S D to move while the board is focused.',
    );
    keyboardHelp.className = 'moyu-game2048__help';
    keyboardHelp.setAttribute('data-game-keyboard-help', 'true');
    this.status = this.document.createElement('p');
    this.status.className = 'moyu-game2048__status';
    this.status.setAttribute('data-game-status', 'true');
    this.status.setAttribute('role', 'status');
    this.board = this.document.createElement('div');
    this.board.className = 'moyu-game2048__board';
    this.board.setAttribute('data-game-board', 'true');
    this.board.setAttribute('role', 'grid');
    this.board.setAttribute('aria-label', '2048 board');
    this.board.setAttribute(
      'aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown W A S D',
    );
    this.board.tabIndex = 0;
    for (let index = 0; index < 16; index += 1) {
      const cell = this.document.createElement('div');
      cell.className = 'moyu-game2048__cell';
      cell.dataset.cell = String(index);
      cell.dataset.value = '0';
      cell.setAttribute('role', 'gridcell');
      this.cells.push(cell);
      this.board.append(cell);
    }
    this.newGameButton = createButton(this.document, {
      label: 'New Game',
      variant: 'secondary',
      onClick: () => {
        this.continueAfterWin = false;
        this.callbacks.onNewGame();
      },
    });
    this.newGameButton.setAttribute('data-game-action', 'new-game');
    const controls = this.document.createElement('div');
    controls.className = 'moyu-game2048__controls';
    controls.setAttribute('data-game-controls', 'true');
    controls.append(this.newGameButton);
    this.section.append(
      heading,
      scores,
      keyboardHelp,
      this.status,
      this.board,
      controls,
    );
    this.modal = new Modal(this.document, this.section);
    this.modal.dialogElement.className = 'moyu-modal moyu-game2048__dialog';
    this.modal.dialogElement.setAttribute('data-game-dialog', 'true');
    this.root.replaceChildren(this.section);
  }

  get boardElement(): HTMLElement {
    return this.board;
  }

  render(state: Game2048State): void {
    if (
      this.renderedSessionId !== undefined &&
      this.renderedSessionId !== state.gameSessionId
    ) {
      this.continueAfterWin = false;
    }
    this.renderedSessionId = state.gameSessionId;
    this.score.textContent = String(state.score);
    this.bestScore.textContent = String(state.bestScore);
    this.status.textContent = state.gameOver
      ? 'Game Over'
      : state.won && !this.continueAfterWin
        ? 'You reached 2048'
        : '';
    state.board.forEach((row, rowIndex) =>
      row.forEach((value, columnIndex) => {
        const cell = this.cells[rowIndex * 4 + columnIndex]!;
        cell.textContent = value === 0 ? '' : String(value);
        cell.dataset.value = String(value);
        cell.setAttribute('aria-label', value === 0 ? 'Empty' : String(value));
      }),
    );
    this.renderDialog(state);
  }

  setPaused(paused: boolean): void {
    this.section.setAttribute('data-paused', String(paused));
    this.board.setAttribute('aria-disabled', String(paused));
    this.newGameButton.disabled = paused;
    if (paused) this.modal.close();
  }

  restoreFocus(token: string | undefined): void {
    if (token === 'board' || token === undefined)
      this.board.focus({ preventScroll: true });
  }

  dispose(): void {
    this.modal.close();
    this.root.replaceChildren();
  }

  private renderDialog(state: Game2048State): void {
    this.modal.close();
    if ((!state.won || this.continueAfterWin) && !state.gameOver) return;
    const gameOver = state.gameOver;
    this.modal.open({
      title: gameOver ? 'Game Over' : 'You reached 2048',
      content: gameOver ? 'Start a new game to try again.' : '2048 reached.',
      returnFocus: this.board,
    });
    const actions = this.document.createElement('div');
    actions.className = 'moyu-game2048__dialog-actions';
    if (!gameOver) {
      const continueButton = createButton(this.document, {
        label: 'Continue',
        variant: 'secondary',
        onClick: () => {
          this.continueAfterWin = true;
          this.modal.close();
          this.callbacks.onContinue();
        },
      });
      continueButton.setAttribute('data-game-action', 'continue');
      actions.append(continueButton);
    }
    const newGameButton = createButton(this.document, {
      label: 'New Game',
      variant: 'primary',
      onClick: () => {
        this.continueAfterWin = false;
        this.modal.close();
        this.callbacks.onNewGame();
      },
    });
    newGameButton.setAttribute('data-game-action', 'new-game');
    actions.append(newGameButton);
    this.modal.dialogElement.append(actions);
  }

  private statBlock(
    label: string,
    value: HTMLElement,
    dataAttribute: 'data-game-score' | 'data-game-best',
  ): HTMLElement {
    const block = this.document.createElement('div');
    block.className = 'moyu-game2048__stat';
    block.setAttribute(dataAttribute, 'true');
    block.append(createText(this.document, 'span', label), value);
    return block;
  }
}
