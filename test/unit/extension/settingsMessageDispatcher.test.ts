import { describe, expect, it } from 'vitest';

import { ReaderSettingsService } from '../../../src/application/reader/ReaderSettingsService';
import { ReaderService } from '../../../src/application/reader/ReaderService';
import { Game2048Service } from '../../../src/application/game2048/Game2048Service';
import { GameRepository } from '../../../src/infrastructure/storage/gameRepository';
import { ProgressRepository } from '../../../src/infrastructure/storage/progressRepository';
import { DEFAULT_READER_SETTINGS } from '../../../src/domain/reader/settings';
import { SettingsMessageDispatcher } from '../../../src/extension/panel/SettingsMessageDispatcher';
import { PreferencesRepository } from '../../../src/infrastructure/storage/preferencesRepository';
import { withStorageDirectory } from '../../fixtures/storage/storageTestHarness';

function request(
  type: 'settings/read' | 'settings/update',
  payload: Record<string, unknown>,
) {
  return {
    protocol: 1,
    id: `request-${type}`,
    sessionId: 'session-current',
    type,
    payload,
  };
}

describe('SettingsMessageDispatcher', () => {
  it('returns correlated populated Reader and durable 2048 service snapshots', async () => {
    await withStorageDirectory(async (root) => {
      const reader = new ReaderService({
        bookProvider: async (bookId) =>
          bookId === 'reader-book'
            ? {
                id: 'reader-book',
                title: 'Reader',
                uri: 'file:///reader.txt',
                type: 'txt' as const,
                encoding: 'utf8' as const,
                fingerprint: 'source-fingerprint',
                size: 40,
                modifiedAt: 1,
                addedAt: 1,
                metadataVersion: 1,
              }
            : undefined,
        progress: new ProgressRepository(root),
        blockReader: {
          loadIndex: async () => ({
            schemaVersion: 1,
            bookId: 'reader-book',
            uri: 'file:///reader.txt',
            size: 40,
            modifiedAt: 1,
            fingerprint: 'source-fingerprint',
            encoding: 'utf8' as const,
            blocks: [
              {
                blockId: 'block-7',
                byteStart: 0,
                byteEnd: 40,
                decodedLength: 40,
                paragraphCount: 1,
                contentFingerprint: 'block-fingerprint-7',
              },
            ],
          }),
          readBlocks: async () => ({
            blocks: [
              {
                id: 'block-7',
                paragraphs: ['A durable reader paragraph.'],
                decodedLength: 40,
                contentFingerprint: 'block-fingerprint-7',
              },
            ],
            atStart: true,
            atEnd: true,
          }),
        },
      });
      const game = new Game2048Service(
        new GameRepository(root),
        () => 0,
        () => 1,
        () => 'durable-game-1',
      );
      let responseSequence = 0;
      const dispatcher = new SettingsMessageDispatcher(
        'session-current',
        new ReaderSettingsService(new PreferencesRepository(root)),
        { reader, game } as never,
        () => `response-${++responseSequence}`,
      );

      await expect(
        dispatcher.dispatch(
          request('reader/open' as never, { bookId: 'reader-book' }),
        ),
      ).resolves.toMatchObject({
        type: 'reader/opened',
        payload: {
          requestId: 'request-reader/open',
          snapshot: {
            bookId: 'reader-book',
            version: 0,
            anchor: {
              blockId: 'block-7',
              characterOffset: 0,
              contentFingerprint: 'block-fingerprint-7',
            },
          },
        },
      });
      await expect(
        dispatcher.dispatch(
          request('reader/readBlocks' as never, {
            bookId: 'reader-book',
            anchor: {
              kind: 'txt',
              blockId: 'block-7',
              characterOffset: 9,
              contentFingerprint: 'block-fingerprint-7',
            },
            direction: 'after',
            limit: 20,
          }),
        ),
      ).resolves.toMatchObject({
        type: 'reader/blocks',
        payload: {
          requestId: 'request-reader/readBlocks',
          batch: { blocks: [{ id: 'block-7' }] },
        },
      });
      await expect(
        dispatcher.dispatch(
          request('game2048/newGame' as never, { baseVersion: 0 }),
        ),
      ).resolves.toMatchObject({
        type: 'game2048/session',
        payload: {
          requestId: 'request-game2048/newGame',
          session: {
            version: 0,
            state: {
              gameSessionId: 'durable-game-1',
              board: expect.arrayContaining([expect.arrayContaining([2])]),
            },
          },
        },
      });
    });
  });

  it('dispatches read and update requests through the real settings service', async () => {
    await withStorageDirectory(async (root) => {
      let responseSequence = 0;
      const dispatcher = new SettingsMessageDispatcher(
        'session-current',
        new ReaderSettingsService(new PreferencesRepository(root)),
        () => `response-${++responseSequence}`,
      );

      await expect(
        dispatcher.dispatch(request('settings/read', {})),
      ).resolves.toEqual({
        protocol: 1,
        id: 'response-1',
        sessionId: 'session-current',
        type: 'settings/snapshot',
        payload: {
          requestId: 'request-settings/read',
          snapshot: { version: 0, settings: DEFAULT_READER_SETTINGS },
        },
      });
      await expect(
        dispatcher.dispatch(
          request('settings/update', {
            baseVersion: 0,
            patch: { lineHeight: 2 },
          }),
        ),
      ).resolves.toMatchObject({
        type: 'settings/snapshot',
        payload: {
          requestId: 'request-settings/update',
          snapshot: { settings: { lineHeight: 2 } },
        },
      });
    });
  });

  it('rejects malformed and stale-session requests before persistence', async () => {
    await withStorageDirectory(async (root) => {
      const repository = new PreferencesRepository(root);
      const dispatcher = new SettingsMessageDispatcher(
        'session-current',
        new ReaderSettingsService(repository),
        () => 'response-unused',
      );

      expect(
        await dispatcher.dispatch(
          request('settings/update', {
            baseVersion: 0,
            patch: { contentWidth: 700.5 },
          }),
        ),
      ).toBeUndefined();
      expect(
        await dispatcher.dispatch({
          ...request('settings/update', {
            baseVersion: 0,
            patch: { fontSize: 20 },
          }),
          sessionId: 'session-stale',
        }),
      ).toBeUndefined();
      expect(await repository.read()).toBeUndefined();
    });
  });

  it('maps a future-base update rejection to a safe correlated error', async () => {
    await withStorageDirectory(async (root) => {
      const dispatcher = new SettingsMessageDispatcher(
        'session-current',
        new ReaderSettingsService(new PreferencesRepository(root)),
        () => 'response-future-base',
      );

      await expect(
        dispatcher.dispatch(
          request('settings/update', {
            baseVersion: 1,
            patch: { fontSize: 20 },
          }),
        ),
      ).resolves.toEqual({
        protocol: 1,
        id: 'response-future-base',
        sessionId: 'session-current',
        type: 'response/error',
        payload: {
          requestId: 'request-settings/update',
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Request payload is invalid.',
          },
        },
      });
    });
  });

  it('maps a settings read rejection without exposing its path or stack', async () => {
    const dispatcher = new SettingsMessageDispatcher(
      'session-current',
      {
        read: async () => {
          throw new Error('C:\\private\\settings.json: denied');
        },
      } as never,
      () => 'response-read-error',
    );

    const response = await dispatcher.dispatch(request('settings/read', {}));

    expect(response).toEqual({
      protocol: 1,
      id: 'response-read-error',
      sessionId: 'session-current',
      type: 'response/error',
      payload: {
        requestId: 'request-settings/read',
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Message could not be processed.',
        },
      },
    });
    expect(JSON.stringify(response)).not.toMatch(
      /private|settings\.json|denied|stack/i,
    );
  });
});
