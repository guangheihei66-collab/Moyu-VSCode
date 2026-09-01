import { describe, expect, it } from 'vitest';

import { BookshelfRepository } from '../../../src/infrastructure/storage/bookshelfRepository';
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

  it('merges a stale checkpoint for a different book but rejects the same book', async () =>
    withStorageDirectory(async (root) => {
      const repository = new ProgressRepository(root);
      const first = await repository.save('a', 0, {
        locator: { kind: 'txt', blockId: 'a-1' },
        percentage: 0.1,
        updatedAt: 10,
      });
      const merged = await repository.save('b', 0, {
        locator: { kind: 'txt', blockId: 'b-1' },
        percentage: 0.2,
        updatedAt: 20,
      });
      expect(merged.data.byBookId).toHaveProperty('a');
      expect(merged.data.byBookId).toHaveProperty('b');
      await expect(
        repository.save('a', 0, {
          locator: { kind: 'txt', blockId: 'a-2' },
          percentage: 0.3,
          updatedAt: 30,
        }),
      ).rejects.toMatchObject({ code: 'STATE_VERSION_CONFLICT' });
      expect(first.version).toBe(0);
    }));

  it('removes progress for one bookshelf book without affecting another', async () =>
    withStorageDirectory(async (root) => {
      const repository = new ProgressRepository(root);
      await repository.save('a', 0, {
        locator: { kind: 'txt' },
        percentage: 0.1,
        updatedAt: 10,
      });
      await repository.save('b', 0, {
        locator: { kind: 'txt' },
        percentage: 0.2,
        updatedAt: 20,
      });
      await repository.remove('a');
      const state = await repository.read();
      expect(state?.data.byBookId).not.toHaveProperty('a');
      expect(state?.data.byBookId).toHaveProperty('b');
    }));
});
