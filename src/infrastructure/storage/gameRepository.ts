import {
  nextEnvelope,
  StateConflict,
  type VersionedEnvelope,
} from '../../domain/persistence/envelope';
import type {
  GameData,
  PersistedGameState,
  Repository,
} from '../../application/persistence/repositories';
import { createJsonTransactionManager } from './fileTransaction';
import { createModuleTransactionPaths } from './recovery';

const guard = (value: unknown): value is VersionedEnvelope<GameData> => {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<VersionedEnvelope<unknown>>;
  const d = e.data as Partial<GameData> | undefined;
  return (
    Number.isSafeInteger(e.schemaVersion) &&
    Number.isSafeInteger(e.version) &&
    Number.isSafeInteger(e.generation) &&
    Number.isFinite(e.updatedAt) &&
    typeof d?.activeSessionId === 'string' &&
    typeof d?.state === 'object' &&
    d.state !== null
  );
};
export class GameRepository implements Repository<GameData> {
  private readonly tx = createJsonTransactionManager();
  constructor(
    private readonly storageRoot: string,
    private readonly now = Date.now,
  ) {}
  async read() {
    return this.tx.recoverJsonState(
      createModuleTransactionPaths(this.storageRoot, 'game2048'),
      guard,
    );
  }
  async save(
    baseVersion: number,
    state: PersistedGameState,
  ): Promise<VersionedEnvelope<GameData>> {
    let staleSession = false;
    return this.tx
      .transactJson(
        createModuleTransactionPaths(this.storageRoot, 'game2048'),
        guard,
        (current) => {
          if (current !== undefined && current.version !== baseVersion)
            throw new StateConflict();
          const old = current?.data;
          if (old && state.gameSessionId !== old.activeSessionId) {
            staleSession = true;
            return nextEnvelope(
              current,
              {
                activeSessionId: old.activeSessionId,
                state: {
                  ...old.state,
                  bestScore: Math.max(
                    old.state.bestScore,
                    state.bestScore,
                    state.score,
                  ),
                },
              },
              this.now(),
            );
          }
          if (old && state.moveSequence <= old.state.moveSequence)
            throw new StateConflict(
              'GAME_SESSION_STALE',
              'The game move is stale.',
            );
          const bestScore = Math.max(
            old?.state.bestScore ?? 0,
            state.bestScore,
            state.score,
          );
          return nextEnvelope(
            current,
            {
              activeSessionId: state.gameSessionId,
              state: { ...state, bestScore },
            },
            this.now(),
          );
        },
      )
      .then((result) => {
        if (staleSession)
          throw new StateConflict(
            'GAME_SESSION_STALE',
            'The game was restarted in another window.',
          );
        return result;
      });
  }
}
