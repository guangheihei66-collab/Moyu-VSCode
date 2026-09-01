import { describe, expect, it, vi } from 'vitest';

import { PresentationSnapshotProvider } from '../../../src/extension/panel/PresentationSnapshotProvider';
import {
  validateHostRequest,
  validateHostResponse,
} from '../../../src/shared/protocol/validate';

describe('PresentationSnapshotProvider', () => {
  it('joins books, progress, and source status without exposing paths or mutating sources', async () => {
    const list = vi.fn(async () => ({
      schemaVersion: 1,
      version: 7,
      generation: 1,
      updatedAt: 20,
      data: {
        books: [
          {
            id: 'book-1',
            title: '<Book>',
            uri: 'file:///private/book.epub',
            type: 'epub' as const,
            addedAt: 1,
            lastOpenedAt: 20,
            metadataVersion: 1,
          },
          {
            id: 'book-2',
            title: 'Older',
            uri: 'file:///private/older.txt',
            type: 'txt' as const,
            addedAt: 2,
            lastOpenedAt: 10,
            metadataVersion: 1,
          },
        ],
        tombstones: [],
      },
    }));
    const readProgress = vi.fn(async () => ({
      schemaVersion: 1,
      version: 4,
      generation: 1,
      updatedAt: 20,
      data: {
        byBookId: {
          'book-1': {
            locator: {
              kind: 'epub',
              chapterId: 'chapter-2',
              paragraphIndex: 1,
              characterOffset: 4,
              contentFingerprint: 'chapter-fp',
            },
            percentage: 0.42,
            updatedAt: 20,
          },
        },
        versions: { 'book-1': 3 },
      },
    }));
    const stat = vi.fn(async (uri: string) => {
      if (uri.endsWith('older.txt')) throw new Error('missing source');
      return { size: 10, modifiedAt: 3, fingerprint: 'fp' };
    });
    const provider = new PresentationSnapshotProvider({
      bookshelf: { list },
      progress: { read: readProgress },
      fileStats: { stat },
    });

    const snapshot = await provider.readHome();

    expect(snapshot).toMatchObject({
      booksCount: 2,
      continueReading: {
        bookId: 'book-1',
        title: '<Book>',
        percentage: 42,
        chapterLabel: 'chapter-2',
        sourceMissing: false,
      },
    });
    expect(snapshot.recentBooks.map((book) => book.bookId)).toEqual([
      'book-1',
      'book-2',
    ]);
    expect(snapshot.recentBooks[1]?.sourceMissing).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('file:///private');
    expect(list).toHaveBeenCalledOnce();
    expect(readProgress).toHaveBeenCalledOnce();
    expect(stat).toHaveBeenCalledTimes(2);
  });

  it('returns empty safe values when durable modules have no data', async () => {
    const provider = new PresentationSnapshotProvider({
      bookshelf: { list: async () => undefined },
      progress: { read: async () => undefined },
      fileStats: { stat: vi.fn() },
    });

    await expect(provider.readHome()).resolves.toEqual({
      recentBooks: [],
      booksCount: 0,
    });
  });
});

describe('Home protocol contract', () => {
  it('validates correlated home read and safe snapshot responses', () => {
    const request = validateHostRequest(
      {
        protocol: 1,
        id: 'home-read-1',
        sessionId: 'session-1',
        type: 'home/read',
        payload: {},
      },
      'session-1',
    );
    expect(request.ok).toBe(true);

    const response = validateHostResponse({
      protocol: 1,
      id: 'home-response-1',
      sessionId: 'session-1',
      type: 'home/snapshot',
      payload: {
        requestId: 'home-read-1',
        snapshot: {
          recentBooks: [],
          booksCount: 0,
        },
      },
    });
    expect(response.ok).toBe(true);
  });
});
