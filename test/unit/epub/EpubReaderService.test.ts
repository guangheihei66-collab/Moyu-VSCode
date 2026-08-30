import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EpubReaderService } from '../../../src/application/reader/EpubReaderService';
import { EpubCache } from '../../../src/infrastructure/epub/EpubCache';
import { EpubParser } from '../../../src/infrastructure/epub/EpubParser';
import { ProgressRepository } from '../../../src/infrastructure/storage/progressRepository';
import type { BookMetadata } from '../../../src/domain/books/types';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';
import { buildFixture } from '../../fixtures/epub/buildFixture';

describe('EpubReaderService', () => {
  it('navigates spine order and restores logical EPUB progress', async () => {
    await withStorageDirectory(async (root) => {
      const file = await fixture(root);
      const book: BookMetadata = {
        id: 'epub',
        title: 'Book',
        uri: file,
        type: 'epub',
        fingerprint: 'source-a',
        size: 1,
        modifiedAt: 2,
        addedAt: 1,
        metadataVersion: 1,
      };
      const service = new EpubReaderService({
        parser: new EpubParser(),
        cache: new EpubCache(root),
        progress: new ProgressRepository(root, () => 10),
        bookProvider: async () => book,
        clock: () => 20,
      });
      expect((await service.nextChapter(book.id, 'chapter-2')).chapterId).toBe(
        'chapter-1',
      );
      expect(
        (await service.previousChapter(book.id, 'chapter-1')).chapterId,
      ).toBe('chapter-2');
      const locator = {
        kind: 'epub' as const,
        chapterId: 'chapter-1',
        paragraphIndex: 0,
        characterOffset: 1,
        contentFingerprint: (await service.openChapter(book.id, 'chapter-1'))
          .contentFingerprint,
      };
      await service.saveProgress(book.id, 0, locator);
      await expect(service.restore(book.id)).resolves.toEqual(locator);
    });
  });
});

async function fixture(directory: string): Promise<string> {
  const file = path.join(directory, 'book.epub');
  await writeFile(
    file,
    await buildFixture([
      {
        name: 'META-INF/container.xml',
        text: '<container><rootfile full-path="OPS/book.opf"/></container>',
      },
      {
        name: 'OPS/book.opf',
        text: '<package><manifest><item id="chapter-1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-2"/><itemref idref="chapter-1"/></spine></package>',
      },
      { name: 'OPS/one.xhtml', text: '<p>One</p>' },
      { name: 'OPS/two.xhtml', text: '<p>Two</p>' },
    ]),
  );
  return file;
}
