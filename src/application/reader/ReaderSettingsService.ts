import type { VersionedEnvelope } from '../../domain/persistence/envelope';
import {
  DEFAULT_READER_SETTINGS,
  validateSettings,
  type ReaderSettingsPatch,
  type ReaderSettingsSnapshot,
} from '../../domain/reader/settings';
import type { ReaderPreferencesData } from '../../infrastructure/storage/preferencesRepository';
interface SettingsRepository {
  read(): Promise<VersionedEnvelope<ReaderPreferencesData> | undefined>;
  update(
    baseVersion: number,
    patch: ReaderSettingsPatch,
  ): Promise<VersionedEnvelope<ReaderPreferencesData>>;
}
export class ReaderSettingsService {
  constructor(private readonly repository: SettingsRepository) {}
  async read(): Promise<ReaderSettingsSnapshot> {
    const state = await this.repository.read();
    return {
      version: state?.version ?? 0,
      settings: state?.data.settings ?? { ...DEFAULT_READER_SETTINGS },
    };
  }
  async update(
    baseVersion: number,
    patch: ReaderSettingsPatch,
  ): Promise<ReaderSettingsSnapshot> {
    const validation = validateSettings(patch);
    if (!validation.ok) throw new RangeError(validation.error);
    const state = await this.repository.update(baseVersion, validation.value);
    return { version: state.version, settings: state.data.settings };
  }
}
