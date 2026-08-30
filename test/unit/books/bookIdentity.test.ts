import { describe, expect, it } from 'vitest';
import {
  normalizeBookUri,
  sameBookUri,
} from '../../../src/domain/books/bookIdentity';

describe('book identity', () => {
  it('compares Windows file URIs case-insensitively', () => {
    expect(
      sameBookUri('file:///C:/Books/A.txt', 'file:///c:/books/a.txt', 'win32'),
    ).toBe(true);
    expect(normalizeBookUri('C:\\Books\\A.txt', 'win32')).toBe(
      'file:///C:/Books/A.txt',
    );
  });
  it('keeps Linux file URI case-sensitive', () => {
    expect(
      sameBookUri('file:///Books/A.txt', 'file:///books/a.txt', 'linux'),
    ).toBe(false);
  });
});
