import { cloneBoard, emptyCells } from './board';
import type { Board, Rng } from './types';

function randomIndex(rng: Rng, length: number): number {
  const value = rng();
  if (!Number.isFinite(value))
    throw new TypeError('RNG must return a finite number.');
  return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
}

export function spawn(board: Board, rng: Rng): Board {
  const cells = emptyCells(board);
  if (cells.length === 0) return board;
  const cell = cells[randomIndex(rng, cells.length)]!;
  const valueRoll = rng();
  if (!Number.isFinite(valueRoll))
    throw new TypeError('RNG must return a finite number.');
  const value = valueRoll < 0.9 ? 2 : 4;
  const next = cloneBoard(board) as number[][];
  next[cell.row]![cell.column] = value;
  return next;
}
