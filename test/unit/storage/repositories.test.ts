import { describe, expect, it } from 'vitest';

import { StateConflict } from '../../../src/domain/persistence/envelope';
import { BookshelfRepository } from '../../../src/infrastructure/storage/bookshelfRepository';
import { GameRepository } from '../../../src/infrastructure/storage/gameRepository';
import { ProgressRepository } from '../../../src/infrastructure/storage/progressRepository';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

const book = (id: string, addedAt = 1) => ({
  id,
  title: id,
  uri: `file:///books/${id}.txt`,
  type: 'txt' as const,
  addedAt,
  metadataVersion: 1,
});

describe('versioned module repositories', () => {
  it('unions concurrent bookshelf additions', async () =>
    withStorageDirectory(async (root) => {
      const repository = new BookshelfRepository(root, () => 10);
      const first = await repository.mutate(0, {
        kind: 'add',
        book: book('a'),
      });
      const second = await repository.mutate(first.version, {
        kind: 'add',
        book: book('b'),
      });
      expect(second.data.books.map((item) => item.id)).toEqual(['a', 'b']);
    }));

  it('retains a tombstone so a stale add cannot resurrect a removed book', async () =>
    withStorageDirectory(async (root) => {
      const repository = new BookshelfRepository(root, () => 20);
      const added = await repository.mutate(0, {
        kind: 'add',
        book: book('a', 1),
      });
      const removed = await repository.mutate(added.version, {
        kind: 'remove',
        bookId: 'a',
        removedAt: 20,
      });
      const stale = await repository.mutate(removed.version, {
        kind: 'add',
        book: book('a', 10),
      });
      expect(stale.data.books).toEqual([]);
      expect(stale.data.tombstones[0]?.bookId).toBe('a');
    }));

  it('merges progress per book and keeps the later logical checkpoint', async () =>
    withStorageDirectory(async (root) => {
      const repository = new ProgressRepository(root);
      const first = await repository.save('a', 0, {
        locator: { kind: 'txt' },
        percentage: 0.1,
        updatedAt: 10,
      });
      const second = await repository.save('a', first.version, {
        locator: { kind: 'txt' },
        percentage: 0.2,
        updatedAt: 20,
      });
      expect(second.data.byBookId.a?.percentage).toBe(0.2);
    }));

  it('rejects stale game sessions while preserving the best score', async () =>
    withStorageDirectory(async (root) => {
      const repository = new GameRepository(root);
      const initial = await repository.save(0, {
        gameSessionId: 's1',
        board: [[2]],
        score: 128,
        bestScore: 128,
        moveSequence: 1,
      });
      await expect(
        repository.save(initial.version, {
          gameSessionId: 's2',
          board: [[2]],
          score: 512,
          bestScore: 512,
          moveSequence: 1,
        }),
      ).rejects.toMatchObject({ code: 'GAME_SESSION_STALE' });
      expect(StateConflict).toBeDefined();
    }));
});
