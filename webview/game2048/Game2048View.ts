import type { Game2048State } from '../../src/domain/game2048/types';

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
  private continueAfterWin = false;

  constructor(
    private readonly root: HTMLElement,
    callbacks: Game2048ViewCallbacks,
  ) {
    this.document = root.ownerDocument ?? document;
    this.callbacks = callbacks;
    this.section = this.document.createElement('section');
    this.section.setAttribute('aria-label', '2048 game');
    const heading = this.document.createElement('h1');
    heading.textContent = '2048';
    const scores = this.document.createElement('div');
    scores.setAttribute('aria-label', 'Scores');
    this.score = this.document.createElement('span');
    this.bestScore = this.document.createElement('span');
    scores.append(this.score, this.bestScore);
    this.newGameButton = this.document.createElement('button');
    this.newGameButton.type = 'button';
    this.newGameButton.textContent = 'New Game';
    this.newGameButton.addEventListener('click', () =>
      this.callbacks.onNewGame(),
    );
    this.status = this.document.createElement('p');
    this.status.setAttribute('role', 'status');
    this.board = this.document.createElement('div');
    this.board.setAttribute('role', 'grid');
    this.board.setAttribute('aria-label', '2048 board');
    this.board.tabIndex = 0;
    for (let index = 0; index < 16; index += 1) {
      const cell = this.document.createElement('div');
      cell.dataset.cell = String(index);
      cell.setAttribute('role', 'gridcell');
      this.cells.push(cell);
      this.board.append(cell);
    }
    this.section.append(
      heading,
      scores,
      this.newGameButton,
      this.status,
      this.board,
    );
    this.root.replaceChildren(this.section);
  }

  get boardElement(): HTMLElement {
    return this.board;
  }

  render(state: Game2048State): void {
    this.score.textContent = `Score: ${state.score}`;
    this.bestScore.textContent = `Best: ${state.bestScore}`;
    this.status.textContent = state.gameOver
      ? 'Game over'
      : state.won && !this.continueAfterWin
        ? 'You reached 2048'
        : '';
    state.board.forEach((row, rowIndex) =>
      row.forEach((value, columnIndex) => {
        const cell = this.cells[rowIndex * 4 + columnIndex]!;
        cell.textContent = value === 0 ? '' : String(value);
        cell.setAttribute('aria-label', value === 0 ? 'Empty' : String(value));
      }),
    );
    this.renderDialog(state);
  }

  setPaused(paused: boolean): void {
    this.board.setAttribute('aria-disabled', String(paused));
  }

  restoreFocus(token: string | undefined): void {
    if (token === 'board' || token === undefined) this.board.focus();
  }

  dispose(): void {
    this.root.replaceChildren();
  }

  private renderDialog(state: Game2048State): void {
    const old = this.section.querySelector('[data-game-dialog]');
    old?.remove();
    if ((!state.won || this.continueAfterWin) && !state.gameOver) return;
    const dialog = this.document.createElement('div');
    dialog.dataset.gameDialog = 'true';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const message = this.document.createElement('p');
    message.textContent = state.gameOver ? 'Game over' : 'You reached 2048';
    const continueButton = this.document.createElement('button');
    continueButton.type = 'button';
    continueButton.textContent = 'Continue';
    continueButton.addEventListener('click', () => {
      this.continueAfterWin = true;
      this.callbacks.onContinue();
    });
    const newGameButton = this.document.createElement('button');
    newGameButton.type = 'button';
    newGameButton.textContent = 'New Game';
    newGameButton.addEventListener('click', () => this.callbacks.onNewGame());
    dialog.append(message, continueButton, newGameButton);
    this.section.append(dialog);
  }
}
