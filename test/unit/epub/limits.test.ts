import { describe, expect, it } from 'vitest';
import {
  EPUB_LIMITS,
  assertWithinLimit,
} from '../../../src/infrastructure/epub/limits';
import { parseXmlWithinLimits } from '../../../src/infrastructure/epub/safeXml';

const expectedLimits = {
  sourceBytes: 256 * 1024 * 1024,
  entries: 4096,
  entryBytes: 16 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  compressionRatio: 100,
  containerXmlBytes: 256 * 1024,
  opfBytes: 4 * 1024 * 1024,
  chapters: 2048,
  chapterMarkupBytes: 8 * 1024 * 1024,
  chapterTextBytes: 4 * 1024 * 1024,
  markupDepth: 64,
  messageBytes: 1024 * 1024,
} as const;

describe('EPUB_LIMITS', () => {
  it('pins every approved numerical boundary', () => {
    expect(EPUB_LIMITS).toEqual(expectedLimits);
    expect(Object.isFrozen(EPUB_LIMITS)).toBe(true);
  });

  it.each(Object.entries(expectedLimits))(
    '%s accepts N and rejects N+1',
    (name, limit) => {
      expect(() => assertWithinLimit(name, limit - 1, limit)).not.toThrow();
      expect(() => assertWithinLimit(name, limit, limit)).not.toThrow();
      expect(() => assertWithinLimit(name, limit + 1, limit)).toThrowError(
        expect.objectContaining({ code: 'EPUB_LIMIT_EXCEEDED' }),
      );
    },
  );
});

describe('parseXmlWithinLimits', () => {
  it('rejects document types, entity declarations, oversized input, and excess depth', () => {
    const bytes = (value: string) => new TextEncoder().encode(value);
    expect(() => parseXmlWithinLimits(bytes('<root/>'), 7, 1)).not.toThrow();
    expect(() => parseXmlWithinLimits(bytes('<root/>'), 6, 1)).toThrowError(
      expect.objectContaining({ code: 'EPUB_LIMIT_EXCEEDED' }),
    );
    expect(() =>
      parseXmlWithinLimits(
        bytes('<!DOCTYPE root [<!ENTITY x "boom">]><root>&x;</root>'),
        100,
        4,
      ),
    ).toThrowError(expect.objectContaining({ code: 'EPUB_UNSAFE_XML' }));
    expect(() =>
      parseXmlWithinLimits(bytes('<a><b/></a>'), 20, 1),
    ).toThrowError(expect.objectContaining({ code: 'EPUB_LIMIT_EXCEEDED' }));
    expect(() => parseXmlWithinLimits(bytes('<root>'), 20, 2)).toThrowError(
      expect.objectContaining({ code: 'EPUB_UNSAFE_XML' }),
    );
    expect(() =>
      parseXmlWithinLimits(Uint8Array.from([0xff]), 20, 2),
    ).toThrowError(expect.objectContaining({ code: 'EPUB_UNSAFE_XML' }));
  });
});
