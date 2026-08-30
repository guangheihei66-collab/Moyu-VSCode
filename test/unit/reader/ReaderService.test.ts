import { describe, expect, it } from 'vitest';
import { ReaderService } from '../../../src/application/reader/ReaderService';
import { ProgressRepository } from '../../../src/infrastructure/storage/progressRepository';
import { TxtBlockReader } from '../../../src/infrastructure/txt/TxtBlockReader';
import type { BookMetadata } from '../../../src/domain/books/types';
import type { TxtLocator } from '../../../src/domain/reader/locator';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

describe('ReaderService', () => {
  it('saves and restores a logical TXT locator independently of viewport size', async () => {
    await withStorageDirectory(async (root) => {
      const book: BookMetadata = {
        id: 'reader-book',
        title: 'Reader book',
        uri: 'file:///book.txt',
        type: 'txt',
        encoding: 'utf8',
        fingerprint: 'fp',
        size: 10,
        modifiedAt: 1,
        addedAt: 1,
        metadataVersion: 1,
      };
      const locator: TxtLocator = {
        kind: 'txt',
        blockId: 'block-0',
        characterOffset: 3,
        contentFingerprint: 'block-fp',
      };
      const blockReader = {
        readBlocks: async () => ({ blocks: [], atStart: true, atEnd: true }),
        loadIndex: async () => ({
          schemaVersion: 1,
          bookId: book.id,
          uri: book.uri,
          size: book.size,
          modifiedAt: book.modifiedAt,
          fingerprint: book.fingerprint,
          encoding: 'utf8' as const,
          blocks: [
            {
              blockId: 'block-0',
              byteStart: 0,
              byteEnd: 10,
              decodedLength: 10,
              paragraphCount: 1,
              contentFingerprint: 'block-fp',
            },
          ],
        }),
      } as unknown as TxtBlockReader;
      const progress = new ProgressRepository(root, () => 100);
      const service = new ReaderService({
        bookProvider: async (id) => (id === book.id ? book : undefined),
        progress,
        blockReader,
        clock: () => 200,
      });

      const saved = await service.saveProgress(book.id, 0, locator);
      expect(saved.data.byBookId[book.id]?.percentage).toBe(0.3);
      expect(await service.restore(book.id)).toEqual(locator);
    });
  });
});
