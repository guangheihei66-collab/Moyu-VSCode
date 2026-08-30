import { BOARD_SIZE, WINNING_TILE, type Board } from './types';

export function getStatus(board: Board): { won: boolean; gameOver: boolean } {
  let won = false;
  let hasEmpty = false;
  let hasMerge = false;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const tile = board[row]?.[column] ?? 0;
      if (tile >= WINNING_TILE) won = true;
      if (tile === 0) hasEmpty = true;
      if (
        tile === board[row]?.[column + 1] ||
        tile === board[row + 1]?.[column]
      ) {
        hasMerge = true;
      }
    }
  }
  return { won, gameOver: !hasEmpty && !hasMerge };
}
