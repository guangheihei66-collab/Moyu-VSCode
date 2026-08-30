import { describe, expect, it } from 'vitest';
import { EpubCache } from '../../../src/infrastructure/epub/EpubCache';
import type { BookMetadata } from '../../../src/domain/books/types';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

const book: BookMetadata = {
  id: 'epub',
  title: 'Book',
  uri: 'file:///book.epub',
  type: 'epub',
  fingerprint: 'source-a',
  size: 1,
  modifiedAt: 2,
  addedAt: 1,
  metadataVersion: 1,
};
const index = {
  schemaVersion: 1 as const,
  sourceFingerprint: 'source-a',
  chapters: [
    {
      id: 'c1',
      title: 'One',
      paragraphs: ['Text'],
      contentFingerprint: 'chapter-a',
    },
  ],
};

describe('EpubCache', () => {
  it('returns only cache entries bound to current source metadata', async () => {
    await withStorageDirectory(async (root) => {
      const cache = new EpubCache(root);
      await cache.save(book, index);
      await expect(cache.load(book)).resolves.toEqual(index);
      await expect(
        cache.load({ ...book, fingerprint: 'changed' }),
      ).resolves.toBeUndefined();
      await cache.remove(book.id);
      await expect(cache.load(book)).resolves.toBeUndefined();
    });
  });
});
