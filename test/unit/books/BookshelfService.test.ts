import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookshelfService } from '../../../src/application/books/BookshelfService';
import { BookshelfRepository } from '../../../src/infrastructure/storage/bookshelfRepository';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

const stats = {
  stat: vi.fn(async () => ({ size: 10, modifiedAt: 20, fingerprint: 'fp' })),
};

beforeEach(() => stats.stat.mockClear());

describe('BookshelfService', () => {
  it('reuses UUID identity on duplicate import', async () =>
    withStorageDirectory(async (root) => {
      const repository = new BookshelfRepository(root);
      const service = new BookshelfService(repository, {
        fileStats: stats,
        platform: 'win32',
        uuid: () => 'book-1',
        clock: () => 1,
      });
      const first = await service.import('file:///C:/Books/A.txt');
      const second = await service.import('file:///c:/books/a.txt');
      expect(second.id).toBe(first.id);
      expect(stats.stat).toHaveBeenCalledOnce();
    }));

  it('removes only bookshelf state and never the source file', async () =>
    withStorageDirectory(async (root) => {
      const removed = vi.fn();
      const repository = new BookshelfRepository(root);
      const service = new BookshelfService(repository, {
        fileStats: stats,
        uuid: () => 'book-1',
        clock: () => 1,
        onBookRemoved: removed,
      });
      const book = await service.import('file:///books/a.txt');
      await service.remove(book.id);
      expect((await repository.read())?.data.books).toEqual([]);
      expect(stats.stat).toHaveBeenCalledOnce();
      expect(removed).toHaveBeenCalledWith(book.id);
    }));

  it('relocates while retaining id and invalidates the derived index', async () =>
    withStorageDirectory(async (root) => {
      const invalidated = vi.fn();
      const repository = new BookshelfRepository(root);
      const service = new BookshelfService(repository, {
        fileStats: stats,
        uuid: () => 'book-1',
        clock: () => 1,
        onIndexInvalidated: invalidated,
      });
      const book = await service.import('file:///books/a.txt');
      const moved = await service.relocate(book.id, 'file:///books/b.txt');
      expect(moved.id).toBe(book.id);
      expect(moved.uri).toBe('file:///books/b.txt');
      expect(invalidated).toHaveBeenCalledWith(book.id);
    }));
});
