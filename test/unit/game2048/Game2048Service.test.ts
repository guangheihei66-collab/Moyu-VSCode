import { describe, expect, it } from 'vitest';
import { Game2048Service } from '../../../src/application/game2048/Game2048Service';
import { GameRepository } from '../../../src/infrastructure/storage/gameRepository';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

describe('Game2048Service', () => {
  it('creates a new session and restores it through load', async () =>
    withStorageDirectory(async (root) => {
      const repository = new GameRepository(root, () => 10);
      const first = new Game2048Service(
        repository,
        () => 0,
        () => 10,
        () => 'session-1',
      );
      const created = await first.newGame(0);
      const restored = new Game2048Service(
        repository,
        () => 0,
        () => 20,
        () => 'session-2',
      );
      const loaded = await restored.load();
      expect(loaded?.data.state.gameSessionId).toBe(
        created.data.state.gameSessionId,
      );
      expect(loaded?.data.state.board).toEqual(created.data.state.board);
    }));

  it('applies ordered moves and rejects an out-of-order sequence', async () =>
    withStorageDirectory(async (root) => {
      const repository = new GameRepository(root);
      const service = new Game2048Service(
        repository,
        () => 0,
        () => 10,
        () => 'session-1',
      );
      const created = await service.newGame(0);
      const moved = await service.move(created.version, 'session-1', 1, 'left');
      expect(moved.data.state.moveSequence).toBe(1);
      await expect(
        service.move(moved.version, 'session-1', 1, 'left'),
      ).rejects.toMatchObject({ code: 'GAME_SESSION_STALE' });
    }));
});
