import { describe, expect, it } from 'vitest';

import { ReaderSettingsService } from '../../../src/application/reader/ReaderSettingsService';
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
});
