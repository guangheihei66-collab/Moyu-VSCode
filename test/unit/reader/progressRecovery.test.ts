import { describe, expect, it } from 'vitest';
import { recoverLocator } from '../../../src/application/reader/progressRecovery';
import type { TxtIndexManifest } from '../../../src/domain/reader/txtIndex';
import type { TxtLocator } from '../../../src/domain/reader/locator';

const manifest = (blocks: TxtIndexManifest['blocks']): TxtIndexManifest => ({
  schemaVersion: 1,
  bookId: 'book-1',
  uri: 'file:///book.txt',
  size: 100,
  modifiedAt: 1,
  fingerprint: 'new-file',
  encoding: 'utf8',
  blocks,
});

const block = (
  blockId: string,
  contentFingerprint: string,
  decodedLength = 10,
) => ({
  blockId,
  byteStart: 0,
  byteEnd: 10,
  decodedLength,
  paragraphCount: 1,
  contentFingerprint,
});

describe('TXT progress recovery', () => {
  it('finds a nearby matching fingerprint before changing the logical anchor', () => {
    const saved: TxtLocator = {
      kind: 'txt',
      blockId: 'block-1',
      characterOffset: 99,
      contentFingerprint: 'keep-me',
    };
    const recovered = recoverLocator(
      saved,
      manifest([block('block-0', 'other'), block('block-7', 'keep-me', 20)]),
    );
    expect(recovered).toEqual({
      kind: 'txt',
      blockId: 'block-7',
      characterOffset: 20,
      contentFingerprint: 'keep-me',
    });
  });

  it('falls back to a clamped percentage when content changed', () => {
    const saved: TxtLocator = {
      kind: 'txt',
      blockId: 'block-1',
      characterOffset: 99,
      contentFingerprint: 'gone',
    };
    const recovered = recoverLocator(
      saved,
      manifest([block('block-0', 'new-0', 10), block('block-1', 'new-1', 20)]),
      2,
    );
    expect(recovered).toMatchObject({
      blockId: 'block-1',
      characterOffset: 20,
      contentFingerprint: 'new-1',
    });
  });
});
