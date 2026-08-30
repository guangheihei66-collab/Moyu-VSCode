import { describe, expect, it } from 'vitest';
import { mergeRowLeft, move } from '../../../src/domain/game2048/move';
import type { Game2048State } from '../../../src/domain/game2048/types';

describe('2048 moves', () => {
  it.each([
    [[2, 2, 2, 2], [4, 4, 0, 0], 8],
    [[4, 4, 8, 0], [8, 8, 0, 0], 8],
    [[2, 2, 4, 0], [4, 4, 0, 0], 4],
  ])('merges left once per source tile', (input, output, score) => {
    expect(mergeRowLeft(input)).toEqual({ row: output, score });
  });

  it('moves immutably and spawns only after an effective move', () => {
    const state: Game2048State = {
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
    const unchanged = move(state, 'left', () => 0);
    expect(unchanged).toMatchObject({ state, moved: false, events: [] });
    const result = move(state, 'right', () => 0);
    expect(result.moved).toBe(true);
    expect(result.state.board[0]).toEqual([2, 0, 0, 2]);
    expect(result.state).not.toBe(state);
  });

  it.each([
    [
      'left',
      [
        [0, 0, 0, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ],
    [
      'right',
      [
        [2, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [
        [2, 0, 0, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ],
    [
      'up',
      [
        [0, 0, 0, 0],
        [0, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ],
    [
      'down',
      [
        [2, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [
        [2, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [2, 0, 0, 0],
      ],
    ],
  ] as const)('supports %s movement', (direction, board, expected) => {
    const state: Game2048State = {
      gameSessionId: 's',
      board,
      score: 0,
      bestScore: 0,
      won: false,
      gameOver: false,
      moveSequence: 0,
      startedAt: 0,
      updatedAt: 0,
      stateVersion: 1,
    };
    expect(move(state, direction, () => 0).state.board).toEqual(expected);
  });

  it('continues moving after victory until the board is actually over', () => {
    const state: Game2048State = {
      gameSessionId: 's',
      board: [
        [2048, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      score: 0,
      bestScore: 0,
      won: true,
      gameOver: false,
      moveSequence: 0,
      startedAt: 0,
      updatedAt: 0,
      stateVersion: 1,
    };
    const result = move(state, 'right', () => 0);
    expect(result.moved).toBe(true);
    expect(result.state.won).toBe(true);
  });
});
