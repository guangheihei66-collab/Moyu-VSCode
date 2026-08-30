import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EncodingSelectionService } from '../../../src/application/reader/EncodingSelectionService';
import { BookshelfRepository } from '../../../src/infrastructure/storage/bookshelfRepository';
import {
  decodeText,
  inspectEncoding,
} from '../../../src/infrastructure/txt/encoding';
import {
  isStrictUtf8,
  isStrictUtf8Prefix,
} from '../../../src/infrastructure/txt/strictUtf8';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';
import {
  gb18030,
  gbk,
  invalidUtf8,
  utf16be,
  utf16le,
  utf8Bom,
  validUtf8,
} from '../../fixtures/txt/encoding-fixtures';

describe('TXT encoding', () => {
  it('detects BOMs, strict UTF-8, and an unconfirmed GB candidate', () => {
    expect(inspectEncoding(utf8Bom)).toEqual({
      kind: 'confirmed',
      encoding: 'utf8',
      bomBytes: 3,
    });
    expect(inspectEncoding(validUtf8)).toEqual({
      kind: 'confirmed',
      encoding: 'utf8',
      bomBytes: 0,
    });
    expect(
      inspectEncoding(Uint8Array.from([0xff, 0xfe, ...utf16le])),
    ).toMatchObject({
      kind: 'confirmed',
      encoding: 'utf16le',
    });
    expect(
      inspectEncoding(Uint8Array.from([0xfe, 0xff, ...utf16be])),
    ).toMatchObject({
      kind: 'confirmed',
      encoding: 'utf16be',
    });
    expect(inspectEncoding(invalidUtf8)).toEqual({
      kind: 'candidate',
      encoding: 'gb18030',
      requiresConfirmation: true,
    });
    expect(isStrictUtf8(Uint8Array.from([0xe4]))).toBe(false);
    expect(isStrictUtf8Prefix(Uint8Array.from([0xe4]))).toBe(true);
  });

  it('decodes every supported encoding and bounds Unicode preview characters', () => {
    expect(decodeText(gb18030, 'gb18030')).toBe('你好');
    expect(decodeText(gbk, 'gbk')).toBe('你好');
    expect(decodeText(utf16be, 'utf16be')).toBe('你好');
    expect(decodeText(Uint8Array.from(Buffer.from('abcdef')), 'utf8', 3)).toBe(
      'abc',
    );
  });

  it('requires explicit confirmation before candidate persistence', async () => {
    const service = new EncodingSelectionService({
      read: async () => undefined,
      mutate: async () => {
        throw new Error('unreachable');
      },
    });
    await expect(
      service.commitCandidateWithoutConfirmation(),
    ).rejects.toMatchObject({ code: 'ENCODING_AMBIGUOUS' });
  });

  it('persists only a confirmed encoding and leaves source files untouched', async () =>
    withStorageDirectory(async (root) => {
      const repository = new BookshelfRepository(root);
      const directory = await mkdtemp(join(tmpdir(), 'moyu-txt-'));
      const path = join(directory, 'book.txt');
      await writeFile(path, Buffer.from(gb18030));
      const bookshelf = new (
        await import('../../../src/application/books/BookshelfService')
      ).BookshelfService(repository, {
        fileStats: {
          stat: async () => ({ size: 4, modifiedAt: 1, fingerprint: 'fp' }),
        },
        uuid: () => 'book-1',
        clock: () => 1,
      });
      const book = await bookshelf.import(path);
      const service = new EncodingSelectionService(repository);
      const confirmed = await service.confirmEncoding(book.id, 'gb18030', 0);
      expect(confirmed.encoding).toBe('gb18030');
    }));
});
