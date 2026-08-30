import {
  nextEnvelope,
  type VersionedEnvelope,
} from '../../domain/persistence/envelope';
import {
  DEFAULT_READER_SETTINGS,
  isReaderSettings,
  mergeSettings,
  READER_SETTING_FIELDS,
  validateSettings,
  type ReaderSettings,
  type ReaderSettingsPatch,
} from '../../domain/reader/settings';
import { createJsonTransactionManager } from './fileTransaction';
import { createModuleTransactionPaths } from './recovery';

export interface ReaderPreferencesData {
  settings: ReaderSettings;
  fieldVersions: Record<keyof ReaderSettings, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key))
  );
}

function guard(
  value: unknown,
): value is VersionedEnvelope<ReaderPreferencesData> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'version',
      'generation',
      'updatedAt',
      'data',
    ]) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 0 ||
    !Number.isSafeInteger(value.generation) ||
    (value.generation as number) < 0 ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt < 0 ||
    !isRecord(value.data) ||
    !hasExactKeys(value.data, ['settings', 'fieldVersions']) ||
    !isReaderSettings(value.data.settings) ||
    !isRecord(value.data.fieldVersions) ||
    !hasExactKeys(value.data.fieldVersions, READER_SETTING_FIELDS)
  ) {
    return false;
  }
  const version = value.version as number;
  return Object.values(value.data.fieldVersions).every(
    (fieldVersion) =>
      Number.isSafeInteger(fieldVersion) &&
      (fieldVersion as number) >= 0 &&
      (fieldVersion as number) <= version,
  );
}

function initialFieldVersions(
  version: number,
): Record<keyof ReaderSettings, number> {
  return {
    fontSize: version,
    lineHeight: version,
    contentWidth: version,
    bossTemplate: version,
  };
}

export class PreferencesRepository {
  private readonly tx = createJsonTransactionManager();
  constructor(
    private readonly storageRoot: string,
    private readonly now = Date.now,
  ) {}
  read(): Promise<VersionedEnvelope<ReaderPreferencesData> | undefined> {
    return this.tx.recoverJsonState(
      createModuleTransactionPaths(this.storageRoot, 'preferences'),
      guard,
    );
  }
  update(
    baseVersion: number,
    patch: ReaderSettingsPatch,
  ): Promise<VersionedEnvelope<ReaderPreferencesData>> {
    if (!Number.isSafeInteger(baseVersion) || baseVersion < 0)
      throw new TypeError('The preferences base version is invalid.');
    const validation = validateSettings(patch);
    if (!validation.ok) throw new RangeError(validation.error);
    return this.tx.transactJson(
      createModuleTransactionPaths(this.storageRoot, 'preferences'),
      guard,
      (current) => {
        if (baseVersion > (current?.version ?? 0))
          throw new TypeError('The preferences base version is in the future.');
        const nextVersion = (current?.version ?? -1) + 1;
        const data: ReaderPreferencesData = {
          settings: mergeSettings(
            current?.data.settings ?? { ...DEFAULT_READER_SETTINGS },
            validation.value,
          ),
          fieldVersions: {
            ...(current?.data.fieldVersions ??
              initialFieldVersions(nextVersion)),
          },
        };
        for (const field of Object.keys(
          validation.value,
        ) as (keyof ReaderSettings)[])
          data.fieldVersions[field] = nextVersion;
        return nextEnvelope(current, data, this.now());
      },
    );
  }
}
