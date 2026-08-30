export const BOARD_SIZE = 4;
export const WINNING_TILE = 2048;

export type Tile = 0 | number;
export type Board = readonly (readonly Tile[])[];
export type Direction = 'left' | 'right' | 'up' | 'down';
export type Rng = () => number;
export type Clock = () => number;

export interface Game2048State {
  gameSessionId: string;
  board: Board;
  score: number;
  bestScore: number;
  won: boolean;
  gameOver: boolean;
  moveSequence: number;
  startedAt: number;
  updatedAt: number;
  stateVersion: number;
}

export type MoveEvent =
  | {
      kind: 'merge';
      row: number;
      column: number;
      value: number;
      gained: number;
    }
  | { kind: 'spawn'; row: number; column: number; value: number };

export interface MoveResult {
  state: Game2048State;
  moved: boolean;
  events: readonly MoveEvent[];
}
