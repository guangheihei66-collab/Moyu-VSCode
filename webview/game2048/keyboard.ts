import type { Direction } from '../../src/domain/game2048/types';

const directions: Readonly<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
};

export function directionForKey(key: string): Direction | undefined {
  return directions[key] ?? directions[key.toLowerCase()];
}

export function handleGameKey(
  event: Pick<KeyboardEvent, 'key' | 'preventDefault'>,
  boardOwnsFocus: boolean,
  paused: boolean,
  onMove: (direction: Direction) => void,
): boolean {
  if (!boardOwnsFocus || paused) return false;
  const direction = directionForKey(event.key);
  if (direction === undefined) return false;
  event.preventDefault();
  onMove(direction);
  return true;
}
