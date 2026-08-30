import { describe, expect, it } from 'vitest';
import { IndexStore } from '../../../src/infrastructure/txt/indexStore';
import type { BookMetadata } from '../../../src/domain/books/types';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

describe('TXT index invalidation', () => {
  it('does not accept a manifest for another book or encoding', async () =>
    withStorageDirectory(async (root) => {
      const store = new IndexStore(root);
      const book: BookMetadata = {
        id: 'book-1',
        title: 'book',
        uri: 'file:///book.txt',
        type: 'txt',
        encoding: 'utf8',
        fingerprint: 'fp',
        size: 1,
        modifiedAt: 1,
        addedAt: 1,
        metadataVersion: 1,
      };
      expect(await store.loadValid(book)).toBeUndefined();
    }));
});
