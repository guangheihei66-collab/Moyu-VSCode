import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../../../src/domain/game2048/board';
import { spawn } from '../../../src/domain/game2048/spawn';

describe('2048 spawn', () => {
  it('uses injected RNG for deterministic cell and value', () => {
    const values = [0, 0.95];
    const board = spawn(emptyBoard(), () => values.shift() ?? 0);
    expect(board[0]?.[0]).toBe(4);
  });
  it('does not allocate a tile on a full board', () => {
    const board = Array.from({ length: 4 }, () => [2, 4, 8, 16]);
    expect(spawn(board, () => 0)).toBe(board);
  });
});
