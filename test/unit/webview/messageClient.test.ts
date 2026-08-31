import { describe, expect, it, vi } from 'vitest';
import { MessageClient } from '../../../webview/shell/messageClient';
import { DEFAULT_READER_SETTINGS } from '../../../src/domain/reader/settings';

const durableReaderAnchor = {
  kind: 'txt' as const,
  blockId: 'block-7',
  characterOffset: 9,
  contentFingerprint: 'block-fingerprint-7',
};

const durableGameState = {
  gameSessionId: 'durable-game-1',
  board: [
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  score: 12,
  bestScore: 12,
  won: false,
  gameOver: false,
  moveSequence: 3,
  startedAt: 1,
  updatedAt: 2,
  stateVersion: 1,
};

const request = {
  protocol: 1 as const,
  id: 'request-1',
  sessionId: 'session-1',
  type: 'books/list' as const,
  payload: {},
};

describe('MessageClient', () => {
  it('uses validated correlated Reader and durable 2048 transports', async () => {
    const api = { postMessage: vi.fn() };
    const ids = [
      'reader-open-1',
      'reader-blocks-1',
      'reader-save-1',
      'game-load-1',
      'game-save-1',
      'game-new-1',
    ];
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => ids.shift()!,
    );

    const opened = client.open('reader-book');
    expect(api.postMessage).toHaveBeenLastCalledWith({
      protocol: 1,
      id: 'reader-open-1',
      sessionId: 'session-1',
      type: 'reader/open',
      payload: { bookId: 'reader-book' },
    });
    expect(
      client.handleMessage({
        protocol: 1,
        id: 'host-reader-open-1',
        sessionId: 'session-1',
        type: 'reader/opened',
        payload: {
          requestId: 'reader-open-1',
          snapshot: {
            bookId: 'reader-book',
            version: 4,
            anchor: durableReaderAnchor,
            title: 'Reader book',
            type: 'txt',
            percentage: 25,
          },
        },
      }),
    ).toBe(true);
    await expect(opened).resolves.toEqual({
      bookId: 'reader-book',
      version: 4,
      anchor: durableReaderAnchor,
      title: 'Reader book',
      type: 'txt',
      percentage: 25,
    });

    const blocks = client.readBlocks(
      'reader-book',
      durableReaderAnchor,
      'after',
      20,
    );
    expect(api.postMessage).toHaveBeenLastCalledWith({
      protocol: 1,
      id: 'reader-blocks-1',
      sessionId: 'session-1',
      type: 'reader/readBlocks',
      payload: {
        bookId: 'reader-book',
        anchor: durableReaderAnchor,
        direction: 'after',
        limit: 20,
      },
    });
    client.handleMessage({
      protocol: 1,
      id: 'host-reader-blocks-1',
      sessionId: 'session-1',
      type: 'reader/blocks',
      payload: {
        requestId: 'reader-blocks-1',
        batch: {
          blocks: [
            {
              id: 'block-7',
              paragraphs: ['A durable paragraph.'],
              decodedLength: 20,
              contentFingerprint: 'block-fingerprint-7',
            },
          ],
          atStart: true,
          atEnd: false,
        },
      },
    });
    await expect(blocks).resolves.toMatchObject({
      blocks: [{ id: 'block-7' }],
    });

    const savedProgress = client.saveProgress(
      'reader-book',
      4,
      durableReaderAnchor,
    );
    client.handleMessage({
      protocol: 1,
      id: 'host-reader-save-1',
      sessionId: 'session-1',
      type: 'reader/progressSaved',
      payload: {
        requestId: 'reader-save-1',
        snapshot: { version: 5, locator: durableReaderAnchor },
      },
    });
    await expect(savedProgress).resolves.toEqual({
      version: 5,
      locator: durableReaderAnchor,
    });

    const loadedGame = client.load();
    client.handleMessage({
      protocol: 1,
      id: 'host-game-load-1',
      sessionId: 'session-1',
      type: 'game2048/session',
      payload: {
        requestId: 'game-load-1',
        session: { version: 6, state: durableGameState },
      },
    });
    await expect(loadedGame).resolves.toEqual({
      version: 6,
      data: { state: durableGameState },
    });

    const savedGame = client.save(6, durableGameState);
    client.handleMessage({
      protocol: 1,
      id: 'host-game-save-1',
      sessionId: 'session-1',
      type: 'game2048/session',
      payload: {
        requestId: 'game-save-1',
        session: { version: 7, state: durableGameState },
      },
    });
    await expect(savedGame).resolves.toEqual({
      version: 7,
      data: { state: durableGameState },
    });

    const newGame = client.newGame(7);
    client.handleMessage({
      protocol: 1,
      id: 'host-game-new-1',
      sessionId: 'session-1',
      type: 'game2048/session',
      payload: {
        requestId: 'game-new-1',
        session: { version: 8, state: durableGameState },
      },
    });
    await expect(newGame).resolves.toEqual({
      version: 8,
      data: { state: durableGameState },
    });
  });

  it('routes EPUB chapter requests with exact book and chapter identities', async () => {
    const api = { postMessage: vi.fn() };
    const ids = ['chapter-list-1', 'chapter-open-1', 'chapter-next-1'];
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => ids.shift()!,
    );

    const chapters = client.listChapters('book-1');
    expect(api.postMessage).toHaveBeenLastCalledWith({
      protocol: 1,
      id: 'chapter-list-1',
      sessionId: 'session-1',
      type: 'reader/listChapters',
      payload: { bookId: 'book-1' },
    });
    client.handleMessage({
      protocol: 1,
      id: 'host-chapter-list-1',
      sessionId: 'session-1',
      type: 'reader/chapters',
      payload: {
        requestId: 'chapter-list-1',
        snapshot: {
          bookId: 'book-1',
          chapters: [
            { chapterId: 'chapter-1', title: 'Chapter 1', position: 0 },
          ],
        },
      },
    });
    await expect(chapters).resolves.toMatchObject({
      bookId: 'book-1',
      chapters: [{ chapterId: 'chapter-1' }],
    });

    const chapter = client.openChapter('book-1', 'chapter-1');
    expect(api.postMessage).toHaveBeenLastCalledWith({
      protocol: 1,
      id: 'chapter-open-1',
      sessionId: 'session-1',
      type: 'reader/openChapter',
      payload: { bookId: 'book-1', chapterId: 'chapter-1' },
    });
    client.handleMessage({
      protocol: 1,
      id: 'host-chapter-open-1',
      sessionId: 'session-1',
      type: 'reader/chapter',
      payload: {
        requestId: 'chapter-open-1',
        snapshot: {
          bookId: 'book-1',
          chapterId: 'chapter-1',
          title: 'Chapter 1',
          position: 0,
          contentFingerprint: 'fingerprint-1',
          paragraphs: ['Safe text'],
        },
      },
    });
    await expect(chapter).resolves.toMatchObject({ chapterId: 'chapter-1' });

    const next = client.navigateChapter('book-1', 'chapter-1', 'next');
    expect(api.postMessage).toHaveBeenLastCalledWith({
      protocol: 1,
      id: 'chapter-next-1',
      sessionId: 'session-1',
      type: 'reader/navigateChapter',
      payload: {
        bookId: 'book-1',
        chapterId: 'chapter-1',
        direction: 'next',
      },
    });
    client.handleMessage({
      protocol: 1,
      id: 'host-chapter-next-1',
      sessionId: 'session-1',
      type: 'reader/chapter',
      payload: {
        requestId: 'chapter-next-1',
        snapshot: {
          bookId: 'book-1',
          chapterId: 'chapter-2',
          title: 'Chapter 2',
          position: 1,
          contentFingerprint: 'fingerprint-2',
          paragraphs: ['Next text'],
        },
      },
    });
    await expect(next).rejects.toThrow(
      'The Host returned an unexpected chapter response.',
    );
  });

  it('correlates responses by request id', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(api);
    const result = client.request(request);
    client.handleMessage({
      protocol: 1,
      id: 'response-1',
      sessionId: 'session-1',
      type: 'response/success',
      payload: { requestId: request.id },
    });
    await expect(result).resolves.toMatchObject({
      payload: { requestId: request.id },
    });
    expect(api.postMessage).toHaveBeenCalledWith(request);
  });

  it('reads a typed settings snapshot through a correlated request', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => 'settings-read-1',
    );

    const result = client.readSettings();
    expect(api.postMessage).toHaveBeenCalledWith({
      protocol: 1,
      id: 'settings-read-1',
      sessionId: 'session-1',
      type: 'settings/read',
      payload: {},
    });
    expect(
      client.handleMessage({
        protocol: 1,
        id: 'settings-response-1',
        sessionId: 'session-1',
        type: 'settings/snapshot',
        payload: {
          requestId: 'settings-read-1',
          snapshot: { version: 3, settings: DEFAULT_READER_SETTINGS },
        },
      }),
    ).toBe(true);

    await expect(result).resolves.toEqual({
      version: 3,
      settings: DEFAULT_READER_SETTINGS,
    });
  });

  it('uses correlated bookshelf snapshots for reads and safe Host actions', async () => {
    const api = { postMessage: vi.fn() };
    const ids = [
      'books-read-1',
      'books-import-1',
      'books-relocate-1',
      'books-encoding-1',
      'books-remove-1',
    ];
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => ids.shift()!,
    );
    const emptySnapshot = { version: 2, books: [] };

    const read = client.readBooks();
    expect(api.postMessage).toHaveBeenLastCalledWith({
      protocol: 1,
      id: 'books-read-1',
      sessionId: 'session-1',
      type: 'books/list',
      payload: {},
    });
    client.handleMessage({
      protocol: 1,
      id: 'books-response-1',
      sessionId: 'session-1',
      type: 'books/snapshot',
      payload: { requestId: 'books-read-1', snapshot: emptySnapshot },
    });
    await expect(read).resolves.toEqual(emptySnapshot);

    const operations = [
      client.importBook(),
      client.relocateBook('book-1'),
      client.selectBookEncoding('book-1'),
      client.removeBook('book-1'),
    ];
    expect(api.postMessage).toHaveBeenNthCalledWith(2, {
      protocol: 1,
      id: 'books-import-1',
      sessionId: 'session-1',
      type: 'books/import',
      payload: {},
    });
    expect(api.postMessage).toHaveBeenNthCalledWith(3, {
      protocol: 1,
      id: 'books-relocate-1',
      sessionId: 'session-1',
      type: 'books/relocate',
      payload: { bookId: 'book-1' },
    });
    expect(api.postMessage).toHaveBeenNthCalledWith(4, {
      protocol: 1,
      id: 'books-encoding-1',
      sessionId: 'session-1',
      type: 'books/selectEncoding',
      payload: { bookId: 'book-1' },
    });
    expect(api.postMessage).toHaveBeenNthCalledWith(5, {
      protocol: 1,
      id: 'books-remove-1',
      sessionId: 'session-1',
      type: 'books/remove',
      payload: { bookId: 'book-1' },
    });
    for (const requestId of [
      'books-import-1',
      'books-relocate-1',
      'books-encoding-1',
      'books-remove-1',
    ]) {
      client.handleMessage({
        protocol: 1,
        id: `${requestId}-response`,
        sessionId: 'session-1',
        type: 'books/snapshot',
        payload: { requestId, snapshot: emptySnapshot },
      });
    }
    await Promise.all(operations);
  });

  it('updates settings with the latest base version and returns the snapshot', async () => {
    const api = { postMessage: vi.fn() };
    const client = new MessageClient(
      api,
      'session-1',
      10_000,
      () => 'settings-update-1',
    );

    const result = client.updateSettings(3, { contentWidth: 900 });
    expect(api.postMessage).toHaveBeenCalledWith({
      protocol: 1,
      id: 'settings-update-1',
      sessionId: 'session-1',
      type: 'settings/update',
      payload: { baseVersion: 3, patch: { contentWidth: 900 } },
    });
    client.handleMessage({
      protocol: 1,
      id: 'settings-response-2',
      sessionId: 'session-1',
      type: 'settings/snapshot',
      payload: {
        requestId: 'settings-update-1',
        snapshot: {
          version: 4,
          settings: { ...DEFAULT_READER_SETTINGS, contentWidth: 900 },
        },
      },
    });

    await expect(result).resolves.toMatchObject({
      version: 4,
      settings: { contentWidth: 900 },
    });
  });

  it('ignores valid responses from a stale Webview session', () => {
    const client = new MessageClient(
      { postMessage: vi.fn() },
      'session-current',
    );

    expect(
      client.handleMessage({
        protocol: 1,
        id: 'response-stale',
        sessionId: 'session-stale',
        type: 'response/success',
        payload: { requestId: 'request-1' },
      }),
    ).toBe(false);
  });

  it('rejects a settings request from a safe correlated error before timeout', async () => {
    vi.useFakeTimers();
    try {
      const client = new MessageClient(
        { postMessage: vi.fn() },
        'session-1',
        60_000,
        () => 'settings-update-error-1',
      );
      const result = client.updateSettings(1, { fontSize: 20 });
      expect(vi.getTimerCount()).toBe(1);

      expect(
        client.handleMessage({
          protocol: 1,
          id: 'response-error-1',
          sessionId: 'session-1',
          type: 'response/error',
          payload: {
            requestId: 'settings-update-error-1',
            error: {
              code: 'INVALID_PAYLOAD',
              message: 'Request payload is invalid.',
            },
          },
        }),
      ).toBe(true);

      await expect(result).rejects.toThrow('Request payload is invalid.');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
