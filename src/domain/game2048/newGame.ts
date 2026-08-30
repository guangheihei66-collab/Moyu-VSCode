import { emptyBoard } from './board';
import { spawn } from './spawn';
import { getStatus } from './status';
import type { Clock, Game2048State, Rng } from './types';

export function createNewGame(
  rng: Rng,
  clock: Clock,
  uuid: () => string,
): Game2048State {
  const first = spawn(emptyBoard(), rng);
  const board = spawn(first, rng);
  const status = getStatus(board);
  const now = clock();
  return {
    gameSessionId: uuid(),
    board,
    score: 0,
    bestScore: 0,
    won: status.won,
    gameOver: status.gameOver,
    moveSequence: 0,
    startedAt: now,
    updatedAt: now,
    stateVersion: 1,
  };
}
