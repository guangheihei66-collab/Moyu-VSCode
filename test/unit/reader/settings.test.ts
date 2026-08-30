import { mkdir, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_READER_SETTINGS,
  mergeSettings,
  validateSettings,
} from '../../../src/domain/reader/settings';
import { ReaderSettingsService } from '../../../src/application/reader/ReaderSettingsService';
import { PreferencesRepository } from '../../../src/infrastructure/storage/preferencesRepository';
import {
  storagePaths,
  withStorageDirectory,
} from '../../fixtures/storage/storageTestHarness';

describe('reader settings', () => {
  it('validates exact ranges and templates', () => {
    expect(validateSettings({ fontSize: 11 }).ok).toBe(false);
    expect(
      validateSettings({
        fontSize: 12,
        lineHeight: 2.2,
        contentWidth: 1200,
        bossTemplate: 'json',
      }).ok,
    ).toBe(true);
    expect(validateSettings({ contentWidth: 1201 }).ok).toBe(false);
  });

  it.each([
    [{ fontSize: 12.5 }, 'fractional font size'],
    [{ contentWidth: 720.5 }, 'fractional content width'],
    [{ lineHeight: Number.NaN }, 'non-finite line height'],
    [{ bossTemplate: 'plaintext' }, 'unknown boss template'],
    [{ fontSize: 16, extra: true }, 'extra property'],
  ])('rejects %s', (patch) => {
    expect(validateSettings(patch).ok).toBe(false);
  });

  it('merges only supplied fields', () => {
    expect(mergeSettings(DEFAULT_READER_SETTINGS, { fontSize: 20 })).toEqual({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 20,
    });
  });

  it('persists field-level last-write-wins updates', async () => {
    await withStorageDirectory(async (root) => {
      const service = new ReaderSettingsService(
        new PreferencesRepository(root),
      );
      const first = await service.update(0, { fontSize: 18 });
      await service.update(0, { lineHeight: 2 });
      const last = await service.update(first.version, { fontSize: 22 });
      expect(last.settings).toMatchObject({ fontSize: 22, lineHeight: 2 });
      expect(
        (
          await new ReaderSettingsService(
            new PreferencesRepository(root),
          ).read()
        ).settings,
      ).toEqual(last.settings);
    });
  });

  it('lets a later stale write win its field without erasing other fields', async () => {
    await withStorageDirectory(async (root) => {
      const service = new ReaderSettingsService(
        new PreferencesRepository(root, () => 100),
      );
      const font = await service.update(0, { fontSize: 18 });
      const width = await service.update(font.version, { contentWidth: 900 });
      const stale = await service.update(font.version, { fontSize: 24 });

      expect(stale.settings).toEqual({
        ...DEFAULT_READER_SETTINGS,
        fontSize: 24,
        contentWidth: 900,
      });
      expect(width.version).toBeLessThan(stale.version);
    });
  });

  it('rejects a future base version before the first persisted update', async () => {
    await withStorageDirectory(async (root) => {
      const service = new ReaderSettingsService(
        new PreferencesRepository(root),
      );

      await expect(service.update(1, { fontSize: 18 })).rejects.toThrow(
        'future',
      );
      expect(await new PreferencesRepository(root).read()).toBeUndefined();
    });
  });

  it('rejects an invalid patch without changing durable settings', async () => {
    await withStorageDirectory(async (root) => {
      const service = new ReaderSettingsService(
        new PreferencesRepository(root),
      );
      await expect(service.update(0, { fontSize: 40 })).rejects.toBeInstanceOf(
        RangeError,
      );
      expect((await service.read()).settings).toEqual(DEFAULT_READER_SETTINGS);
    });
  });

  it.each([
    [
      'unknown schema version',
      {
        schemaVersion: 2,
        version: 0,
        generation: 0,
        updatedAt: 10,
        data: {
          settings: DEFAULT_READER_SETTINGS,
          fieldVersions: {
            fontSize: 0,
            lineHeight: 0,
            contentWidth: 0,
            bossTemplate: 0,
          },
        },
      },
    ],
    [
      'missing envelope timestamp',
      {
        schemaVersion: 1,
        version: 0,
        generation: 0,
        data: {
          settings: DEFAULT_READER_SETTINGS,
          fieldVersions: {
            fontSize: 0,
            lineHeight: 0,
            contentWidth: 0,
            bossTemplate: 0,
          },
        },
      },
    ],
    [
      'incomplete field version map',
      {
        schemaVersion: 1,
        version: 0,
        generation: 0,
        updatedAt: 10,
        data: {
          settings: DEFAULT_READER_SETTINGS,
          fieldVersions: {
            fontSize: 0,
            lineHeight: 0,
            bossTemplate: 0,
          },
        },
      },
    ],
    [
      'extra field version',
      {
        schemaVersion: 1,
        version: 0,
        generation: 0,
        updatedAt: 10,
        data: {
          settings: DEFAULT_READER_SETTINGS,
          fieldVersions: {
            fontSize: 0,
            lineHeight: 0,
            contentWidth: 0,
            bossTemplate: 0,
            privateSetting: 0,
          },
        },
      },
    ],
    [
      'field version ahead of the envelope',
      {
        schemaVersion: 1,
        version: 0,
        generation: 0,
        updatedAt: 10,
        data: {
          settings: DEFAULT_READER_SETTINGS,
          fieldVersions: {
            fontSize: 1,
            lineHeight: 0,
            contentWidth: 0,
            bossTemplate: 0,
          },
        },
      },
    ],
  ])('rejects persisted settings with a %s', async (_name, candidate) => {
    await withStorageDirectory(async (root) => {
      const paths = storagePaths(root, 'preferences');
      await mkdir(paths.stateDirectory, { recursive: true });
      await writeFile(paths.current, JSON.stringify(candidate), 'utf8');

      expect(await new PreferencesRepository(root).read()).toBeUndefined();
    });
  });
});
