import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as iconv from 'iconv-lite';
import type {
  ReaderBlockBatch,
  TxtLocator,
} from '../../../src/domain/reader/locator';
import type { BookMetadata } from '../../../src/domain/books/types';
import { TxtBlockReader } from '../../../src/infrastructure/txt/TxtBlockReader';
import { TxtIndexer } from '../../../src/infrastructure/txt/TxtIndexer';
import { IndexStore } from '../../../src/infrastructure/txt/indexStore';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

async function createBook(
  content: string,
): Promise<{ path: string; book: BookMetadata }> {
  const directory = await mkdtemp(join(tmpdir(), 'moyu-reader-source-'));
  const path = join(directory, 'book.txt');
  const bytes = iconv.encode(content, 'gb18030');
  await writeFile(path, bytes);
  return {
    path,
    book: {
      id: 'reader-book',
      title: 'Reader book',
      uri: path,
      type: 'txt',
      encoding: 'gb18030',
      fingerprint: `fixture:${bytes.length}`,
      size: bytes.length,
      modifiedAt: 1,
      addedAt: 1,
      metadataVersion: 1,
    },
  };
}

async function withPreparedReader<T>(
  content: string,
  run: (value: {
    reader: TxtBlockReader;
    index: {
      blocks: readonly { blockId: string; contentFingerprint: string }[];
    };
    book: BookMetadata;
  }) => Promise<T>,
): Promise<T> {
  const source = await createBook(content);
  return withStorageDirectory(async (root) => {
    const store = new IndexStore(root);
    const index = await new TxtIndexer({
      store,
      blockTargetChars: 1,
    }).build(source.book, new AbortController().signal);
    const reader = new TxtBlockReader({
      bookProvider: async (bookId) =>
        bookId === source.book.id ? source.book : undefined,
      indexStore: store,
    });
    return run({ reader, index, book: source.book });
  });
}

function locatorFor(
  index: { blocks: readonly { blockId: string; contentFingerprint: string }[] },
  block = 0,
): TxtLocator {
  const entry = index.blocks[block]!;
  return {
    kind: 'txt',
    blockId: entry.blockId,
    characterOffset: 0,
    contentFingerprint: entry.contentFingerprint,
  };
}

describe('TxtBlockReader', () => {
  it('reads bounded blocks after and before a logical anchor', async () => {
    const content = Array.from(
      { length: 25 },
      (_, index) => `段落 ${index}`,
    ).join('\n');
    await withPreparedReader(content, async ({ reader, index, book }) => {
      const first = locatorFor(index);

      const after = await reader.readBlocks(book.id, first, 'after', 20);
      expect(after.blocks).toHaveLength(20);
      expect(after.blocks[0]?.paragraphs).toEqual(['段落 1']);
      expect(after.atEnd).toBe(false);

      const before = await reader.readBlocks(book.id, first, 'before', 20);
      expect(before).toMatchObject<Partial<ReaderBlockBatch>>({
        blocks: [],
        atStart: true,
      });
    });
  });

  it('returns an explicit empty-book boundary state', async () => {
    await withPreparedReader('', async ({ reader, book }) => {
      const result = await reader.readBlocks(
        book.id,
        {
          kind: 'txt',
          blockId: 'empty',
          characterOffset: 0,
          contentFingerprint: 'empty',
        },
        'after',
        20,
      );
      expect(result).toEqual({ blocks: [], atStart: true, atEnd: true });
    });
  });

  it('reports missing sources and invalid indexes as recoverable errors', async () => {
    const missingBook: BookMetadata = {
      id: 'missing-book',
      title: 'Missing',
      uri: join(tmpdir(), 'moyu-file-that-does-not-exist.txt'),
      type: 'txt',
      encoding: 'utf8',
      fingerprint: 'missing',
      size: 0,
      modifiedAt: 1,
      addedAt: 1,
      metadataVersion: 1,
    };
    await withStorageDirectory(async (root) => {
      const reader = new TxtBlockReader({
        bookProvider: async (id) =>
          id === missingBook.id ? missingBook : undefined,
        indexStore: new IndexStore(root),
      });
      const anchor: TxtLocator = {
        kind: 'txt',
        blockId: 'block-0',
        characterOffset: 0,
        contentFingerprint: 'none',
      };
      await expect(
        reader.readBlocks(missingBook.id, anchor, 'after', 1),
      ).rejects.toMatchObject({
        code: 'BOOK_SOURCE_MISSING',
      });
    });

    const source = await createBook('原始内容');
    await withStorageDirectory(async (root) => {
      const reader = new TxtBlockReader({
        bookProvider: async (id) =>
          id === source.book.id ? source.book : undefined,
        indexStore: new IndexStore(root),
      });
      await expect(
        reader.readBlocks(
          source.book.id,
          {
            kind: 'txt',
            blockId: 'block-0',
            characterOffset: 0,
            contentFingerprint: 'none',
          },
          'after',
          1,
        ),
      ).rejects.toMatchObject({ code: 'TXT_INDEX_INVALID' });
    });
  });

  it('rejects a source that no longer matches the indexed block', async () => {
    await withPreparedReader(
      '原始内容\n第二段',
      async ({ reader, index, book }) => {
        await writeFile(book.uri, iconv.encode('修改后的内容', 'gb18030'));
        await expect(
          reader.readBlocks(book.id, locatorFor(index), 'after', 1),
        ).rejects.toMatchObject({ code: 'TXT_SOURCE_CHANGED' });
      },
    );
  });
});
