import { randomUUID } from 'node:crypto';
import {
  StateConflict,
  type VersionedEnvelope,
} from '../../domain/persistence/envelope';
import { move as applyMove } from '../../domain/game2048/move';
import { createNewGame } from '../../domain/game2048/newGame';
import type {
  Direction,
  Game2048State,
  Rng,
} from '../../domain/game2048/types';
import type { GameData, PersistedGameState } from '../persistence/repositories';

export type VersionedGameState = VersionedEnvelope<GameData>;

export interface GameRepositoryLike {
  read(): Promise<VersionedGameState | undefined>;
  newGame(
    baseVersion: number,
    state: PersistedGameState,
  ): Promise<VersionedGameState>;
  save(
    baseVersion: number,
    state: PersistedGameState,
  ): Promise<VersionedGameState>;
}

export class Game2048Service {
  private localState: Game2048State | undefined;

  constructor(
    private readonly repository: GameRepositoryLike,
    private readonly rng: Rng = Math.random,
    private readonly clock: () => number = Date.now,
    private readonly uuid: () => string = randomUUID,
  ) {}

  get state(): Game2048State | undefined {
    return this.localState;
  }

  async load(): Promise<VersionedGameState | undefined> {
    const envelope = await this.repository.read();
    this.localState = envelope?.data.state as unknown as
      | Game2048State
      | undefined;
    return envelope;
  }

  async newGame(baseVersion: number): Promise<VersionedGameState> {
    const state = createNewGame(this.rng, this.clock, this.uuid);
    const envelope = await this.repository.newGame(
      baseVersion,
      state as unknown as PersistedGameState,
    );
    this.localState = envelope.data.state as unknown as Game2048State;
    return envelope;
  }

  async move(
    baseVersion: number,
    sessionId: string,
    moveSequence: number,
    direction: Direction,
  ): Promise<VersionedGameState> {
    let current = this.localState;
    if (current === undefined) {
      const envelope = await this.load();
      current = envelope?.data.state as unknown as Game2048State | undefined;
    }
    if (current === undefined) {
      throw new StateConflict(
        'GAME_SESSION_STALE',
        'A game must be created before moving.',
      );
    }
    if (
      current.gameSessionId !== sessionId ||
      current.moveSequence + 1 !== moveSequence
    ) {
      throw new StateConflict(
        'GAME_SESSION_STALE',
        'The game session or move sequence is stale.',
      );
    }

    const result = applyMove(current, direction, this.rng);
    if (!result.moved) {
      const envelope = await this.repository.read();
      if (envelope === undefined || envelope.version !== baseVersion) {
        throw new StateConflict(
          'GAME_SESSION_STALE',
          'The game state changed in another window.',
        );
      }
      return envelope;
    }

    const nextState: Game2048State = {
      ...result.state,
      updatedAt: this.clock(),
    };
    const envelope = await this.repository.save(
      baseVersion,
      nextState as unknown as PersistedGameState,
    );
    this.localState = envelope.data.state as unknown as Game2048State;
    return envelope;
  }
}
