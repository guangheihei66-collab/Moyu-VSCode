import { boardsEqual } from './board';
import { spawn } from './spawn';
import { getStatus } from './status';
import {
  BOARD_SIZE,
  type Board,
  type Direction,
  type Game2048State,
  type MoveEvent,
  type MoveResult,
  type Rng,
} from './types';

export interface MergedRow {
  row: readonly number[];
  score: number;
}

interface MergeDetails extends MergedRow {
  merges: readonly { target: number; value: number; gained: number }[];
}

function mergeRowLeftWithDetails(input: readonly number[]): MergeDetails {
  const values = input.filter((value) => value !== 0);
  const row: number[] = [];
  const merges: { target: number; value: number; gained: number }[] = [];
  let score = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (values[index + 1] === value) {
      const merged = value * 2;
      merges.push({ target: row.length, value: merged, gained: merged });
      row.push(merged);
      score += merged;
      index += 1;
    } else {
      row.push(value);
    }
  }
  while (row.length < input.length) row.push(0);
  return { row, score, merges };
}

export function mergeRowLeft(input: readonly number[]): MergedRow {
  const { row, score } = mergeRowLeftWithDetails(input);
  return { row, score };
}

function line(
  board: Board,
  direction: Direction,
  index: number,
): readonly number[] {
  if (direction === 'left' || direction === 'right') {
    const values = [...(board[index] ?? [])];
    return direction === 'left' ? values : values.reverse();
  }
  const values = Array.from(
    { length: BOARD_SIZE },
    (_, offset) => board[offset]?.[index] ?? 0,
  );
  return direction === 'up' ? values : values.reverse();
}

function setLine(
  board: number[][],
  direction: Direction,
  index: number,
  values: readonly number[],
): void {
  const restored =
    direction === 'left' || direction === 'up'
      ? [...values]
      : [...values].reverse();
  if (direction === 'left' || direction === 'right') board[index] = restored;
  else
    restored.forEach((value, offset) => {
      board[offset]![index] = value;
    });
}

function coordinates(
  direction: Direction,
  lineIndex: number,
  target: number,
): { row: number; column: number } {
  if (direction === 'left') return { row: lineIndex, column: target };
  if (direction === 'right')
    return { row: lineIndex, column: BOARD_SIZE - 1 - target };
  if (direction === 'up') return { row: target, column: lineIndex };
  return { row: BOARD_SIZE - 1 - target, column: lineIndex };
}

function transformedBoard(
  board: Board,
  direction: Direction,
): { board: Board; score: number; events: MoveEvent[] } {
  const next = Array.from({ length: BOARD_SIZE }, () =>
    Array<number>(BOARD_SIZE).fill(0),
  );
  const events: MoveEvent[] = [];
  let score = 0;
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const merged = mergeRowLeftWithDetails(line(board, direction, index));
    setLine(next, direction, index, merged.row);
    for (const merge of merged.merges)
      events.push({
        kind: 'merge',
        ...coordinates(direction, index, merge.target),
        value: merge.value,
        gained: merge.gained,
      });
    score += merged.score;
  }
  return { board: next, score, events };
}

export function move(
  state: Game2048State,
  direction: Direction,
  rng: Rng,
): MoveResult {
  if (state.gameOver) return { state, moved: false, events: [] };
  const transformed = transformedBoard(state.board, direction);
  if (boardsEqual(transformed.board, state.board))
    return { state, moved: false, events: [] };
  const nextBoard = spawn(transformed.board, rng);
  const status = getStatus(nextBoard);
  const events = [...transformed.events];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      if (
        transformed.board[row]?.[column] === 0 &&
        nextBoard[row]?.[column] !== 0
      ) {
        events.push({
          kind: 'spawn',
          row,
          column,
          value: nextBoard[row]![column]!,
        });
      }
    }
  }
  const nextState: Game2048State = {
    ...state,
    board: nextBoard,
    score: state.score + transformed.score,
    bestScore: Math.max(state.bestScore, state.score + transformed.score),
    won: state.won || status.won,
    gameOver: status.gameOver,
    moveSequence: state.moveSequence + 1,
    stateVersion: state.stateVersion + 1,
  };
  return { state: nextState, moved: true, events };
}
