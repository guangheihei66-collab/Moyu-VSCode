import { describe, expect, it } from 'vitest';
import { getStatus } from '../../../src/domain/game2048/status';

describe('2048 status', () => {
  it('reports victory without forcing game over', () => {
    const board = [
      [2048, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(getStatus(board)).toEqual({ won: true, gameOver: false });
  });
  it('reports game over only when no empty or mergeable cell remains', () => {
    const board = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    expect(getStatus(board)).toEqual({ won: false, gameOver: true });
  });
});
