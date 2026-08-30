import type { Direction } from '../../domain/game2048/types';
import type { Game2048Service } from './Game2048Service';

export interface NewGameCommand {
  kind: 'newGame';
  baseVersion: number;
}

export interface MoveCommand {
  kind: 'move';
  baseVersion: number;
  sessionId: string;
  moveSequence: number;
  direction: Direction;
}

export type GameCommand = NewGameCommand | MoveCommand;

export function executeGameCommand(
  service: Game2048Service,
  command: GameCommand,
) {
  return command.kind === 'newGame'
    ? service.newGame(command.baseVersion)
    : service.move(
        command.baseVersion,
        command.sessionId,
        command.moveSequence,
        command.direction,
      );
}
