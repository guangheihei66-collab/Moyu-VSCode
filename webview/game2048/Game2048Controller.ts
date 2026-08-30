import { move as applyMove } from '../../src/domain/game2048/move';
import type {
  Direction,
  Game2048State,
  Rng,
} from '../../src/domain/game2048/types';
import { handleGameKey } from './keyboard';
import { Game2048View } from './Game2048View';

export interface Game2048Transport {
  load: () => Promise<
    { version: number; data: { state: Game2048State } } | undefined
  >;
  save: (
    baseVersion: number,
    state: Game2048State,
  ) => Promise<{ version: number; data: { state: Game2048State } }>;
  newGame: (
    baseVersion: number,
  ) => Promise<{ version: number; data: { state: Game2048State } }>;
}

function emptyState(): Game2048State {
  return {
    gameSessionId: 'webview',
    board: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
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

export class Game2048Controller {
  private view: Game2048View | undefined;
  private state = emptyState();
  private baseVersion = 0;
  private paused = false;
  private disposed = false;

  constructor(
    private readonly transport: Game2048Transport,
    private readonly rng: Rng = Math.random,
  ) {}

  mount(root: HTMLElement): void {
    this.disposed = false;
    const view = new Game2048View(root, {
      onMove: (direction) => void this.move(direction),
      onNewGame: () => void this.newGame(),
      onContinue: () => this.view?.render(this.state),
    });
    this.view = view;
    view.render(this.state);
    view.boardElement.addEventListener('keydown', (event) => {
      handleGameKey(
        event,
        view.boardElement.ownerDocument.activeElement === view.boardElement,
        this.paused,
        (direction) => void this.move(direction),
      );
    });
    void this.restore();
  }

  dispose(): void {
    this.disposed = true;
    this.view?.dispose();
    this.view = undefined;
  }
  pause(): void {
    this.paused = true;
    this.view?.setPaused(true);
  }
  resume(): void {
    this.paused = false;
    this.view?.setPaused(false);
  }
  restoreFocus(token: string | undefined): void {
    this.view?.restoreFocus(token);
  }

  private async restore(): Promise<void> {
    const envelope = await this.transport.load();
    if (this.disposed || envelope === undefined) return;
    this.baseVersion = envelope.version;
    this.state = envelope.data.state;
    this.view?.render(this.state);
  }

  private async move(direction: Direction): Promise<void> {
    if (this.paused || this.state.gameOver) return;
    const result = applyMove(this.state, direction, this.rng);
    if (!result.moved) return;
    const envelope = await this.transport.save(this.baseVersion, result.state);
    if (this.disposed) return;
    this.baseVersion = envelope.version;
    this.state = envelope.data.state;
    this.view?.render(this.state);
  }

  private async newGame(): Promise<void> {
    const envelope = await this.transport.newGame(this.baseVersion);
    if (this.disposed) return;
    this.baseVersion = envelope.version;
    this.state = envelope.data.state;
    this.view?.render(this.state);
  }
}
