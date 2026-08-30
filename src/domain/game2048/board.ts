import { BOARD_SIZE, type Board, type Tile } from './types';

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<Tile>(BOARD_SIZE).fill(0),
  );
}

export function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === BOARD_SIZE &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === BOARD_SIZE &&
        row.every((tile) => Number.isSafeInteger(tile) && tile >= 0),
    )
  );
}

export function boardsEqual(left: Board, right: Board): boolean {
  return left.every((row, rowIndex) =>
    row.every((tile, columnIndex) => tile === right[rowIndex]?.[columnIndex]),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function emptyCells(
  board: Board,
): readonly { row: number; column: number }[] {
  const cells: { row: number; column: number }[] = [];
  board.forEach((row, rowIndex) =>
    row.forEach((tile, columnIndex) => {
      if (tile === 0) cells.push({ row: rowIndex, column: columnIndex });
    }),
  );
  return cells;
}
