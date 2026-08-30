import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as iconv from 'iconv-lite';
import { TxtIndexer } from '../../../src/infrastructure/txt/TxtIndexer';
import { IndexStore } from '../../../src/infrastructure/txt/indexStore';
import type { BookMetadata } from '../../../src/domain/books/types';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

async function fixture(): Promise<{ path: string; book: BookMetadata }> {
  const directory = await mkdtemp(join(tmpdir(), 'moyu-index-source-'));
  const path = join(directory, 'book.txt');
  const bytes = iconv.encode('第一段\r\n第二段\n第三段', 'gb18030');
  await writeFile(path, bytes);
  return {
    path,
    book: {
      id: 'book-1',
      title: 'book',
      uri: path,
      type: 'txt',
      encoding: 'gb18030',
      fingerprint: 'fixture',
      size: bytes.length,
      modifiedAt: 1,
      addedAt: 1,
      metadataVersion: 1,
    },
  };
}

async function encodedFixture(
  content: string,
  encoding: NonNullable<BookMetadata['encoding']>,
  bom: Uint8Array = new Uint8Array(),
): Promise<{ path: string; book: BookMetadata }> {
  const directory = await mkdtemp(join(tmpdir(), 'moyu-index-source-'));
  const path = join(directory, 'book.txt');
  const encoded = iconv.encode(content, encoding);
  const bytes = Buffer.concat([Buffer.from(bom), encoded]);
  await writeFile(path, bytes);
  return {
    path,
    book: {
      id: 'book-encoded',
      title: 'encoded book',
      uri: path,
      type: 'txt',
      encoding,
      fingerprint: `${encoding}:${bytes.length}`,
      size: bytes.length,
      modifiedAt: 1,
      addedAt: 1,
      metadataVersion: 1,
    },
  };
}

describe('TxtIndexer', () => {
  it('counts paragraphs and keeps encoded byte ranges', async () => {
    await withStorageDirectory(async (storage) => {
      const { book } = await fixture();
      const index = await new TxtIndexer({
        store: new IndexStore(storage),
        blockTargetChars: 1,
      }).build(book, new AbortController().signal);
      expect(
        index.blocks.reduce((sum, block) => sum + block.paragraphCount, 0),
      ).toBe(3);
      expect(
        index.blocks.every((block) => block.byteEnd > block.byteStart),
      ).toBe(true);
    });
  });

  it('reuses unchanged manifests and invalidates changed metadata', async () => {
    await withStorageDirectory(async (storage) => {
      const { book } = await fixture();
      const store = new IndexStore(storage);
      const index = await new TxtIndexer({ store }).build(
        book,
        new AbortController().signal,
      );
      expect(await store.loadValid(book)).toEqual(index);
      expect(await store.loadValid({ ...book, modifiedAt: 2 })).toBeUndefined();
    });
  });

  it('cancels before publication', async () => {
    await withStorageDirectory(async (storage) => {
      const { book } = await fixture();
      const controller = new AbortController();
      const store = new IndexStore(storage);
      await expect(
        new TxtIndexer({ store }).build(book, controller.signal, () =>
          controller.abort(),
        ),
      ).rejects.toBeDefined();
      expect(await store.loadValid(book)).toBeUndefined();
    });
  });

  it('keeps byte boundaries when a UTF-8 character crosses a stream chunk', async () => {
    await withStorageDirectory(async (storage) => {
      const content = `${'a'.repeat(65_534)}你\n尾`;
      const { book } = await encodedFixture(
        content,
        'utf8',
        Uint8Array.from([0xef, 0xbb, 0xbf]),
      );
      const index = await new TxtIndexer({
        store: new IndexStore(storage),
        blockTargetChars: 100_000,
      }).build(book, new AbortController().signal);

      expect(index.blocks).toHaveLength(1);
      expect(index.blocks[0]).toMatchObject({
        byteStart: 3,
        byteEnd: book.size,
        paragraphCount: 2,
        decodedLength: Array.from(content).length,
      });
    });
  });

  it('does not assume a UTF-16 BOM when the confirmed source has none', async () => {
    await withStorageDirectory(async (storage) => {
      const content = '你好\n世界';
      const { book } = await encodedFixture(content, 'utf16le');
      const index = await new TxtIndexer({
        store: new IndexStore(storage),
        blockTargetChars: 100,
      }).build(book, new AbortController().signal);

      expect(index.blocks[0]).toMatchObject({
        byteStart: 0,
        byteEnd: book.size,
        paragraphCount: 2,
        decodedLength: Array.from(content).length,
      });
    });
  });
});
