import { describe, expect, it } from 'vitest';
import { Game2048Service } from '../../../src/application/game2048/Game2048Service';
import { GameRepository } from '../../../src/infrastructure/storage/gameRepository';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

describe('2048 session concurrency', () => {
  it('rejects an old window after an explicit new game and keeps its score as best score', async () =>
    withStorageDirectory(async (root) => {
      const repository = new GameRepository(root);
      const firstWindow = new Game2048Service(
        repository,
        () => 0,
        () => 1,
        () => 'session-1',
      );
      const first = await firstWindow.newGame(0);
      const secondWindow = new Game2048Service(
        repository,
        () => 0,
        () => 2,
        () => 'session-2',
      );
      const second = await secondWindow.newGame(first.version);

      await expect(
        firstWindow.move(first.version, 'session-1', 1, 'left'),
      ).rejects.toMatchObject({ code: 'GAME_SESSION_STALE' });
      const latest = await repository.read();
      expect(latest?.data.activeSessionId).toBe(second.data.activeSessionId);
      expect(latest?.data.state.bestScore).toBeGreaterThanOrEqual(
        first.data.state.bestScore,
      );
    }));
});
