export type BossTemplate = 'typescript' | 'json' | 'buildLog';
export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  bossTemplate: BossTemplate;
}
export type ReaderSettingsPatch = Partial<ReaderSettings>;
export interface ReaderSettingsSnapshot {
  version: number;
  settings: ReaderSettings;
}

export const READER_SETTING_FIELDS = [
  'fontSize',
  'lineHeight',
  'contentWidth',
  'bossTemplate',
] as const satisfies readonly (keyof ReaderSettings)[];

export const DEFAULT_READER_SETTINGS: Readonly<ReaderSettings> = Object.freeze({
  fontSize: 16,
  lineHeight: 1.75,
  contentWidth: 720,
  bossTemplate: 'typescript',
});
export type SettingsValidation =
  | { ok: true; value: ReaderSettingsPatch }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSettings(value: unknown): SettingsValidation {
  if (!isRecord(value))
    return { ok: false, error: 'Reader settings must be an object.' };
  if (
    Object.keys(value).some(
      (key) => !(READER_SETTING_FIELDS as readonly string[]).includes(key),
    )
  )
    return { ok: false, error: 'Unknown reader setting.' };
  if (
    value.fontSize !== undefined &&
    (!Number.isSafeInteger(value.fontSize) ||
      (value.fontSize as number) < 12 ||
      (value.fontSize as number) > 32)
  )
    return { ok: false, error: 'Font size must be between 12 and 32.' };
  if (
    value.lineHeight !== undefined &&
    (typeof value.lineHeight !== 'number' ||
      !Number.isFinite(value.lineHeight) ||
      value.lineHeight < 1.2 ||
      value.lineHeight > 2.2)
  )
    return { ok: false, error: 'Line height must be between 1.2 and 2.2.' };
  if (
    value.contentWidth !== undefined &&
    (!Number.isSafeInteger(value.contentWidth) ||
      (value.contentWidth as number) < 480 ||
      (value.contentWidth as number) > 1200)
  )
    return { ok: false, error: 'Content width must be between 480 and 1200.' };
  if (
    value.bossTemplate !== undefined &&
    (typeof value.bossTemplate !== 'string' ||
      !(['typescript', 'json', 'buildLog'] as const).includes(
        value.bossTemplate as BossTemplate,
      ))
  )
    return { ok: false, error: 'Boss template is invalid.' };
  return { ok: true, value: { ...value } as ReaderSettingsPatch };
}

export function isReaderSettings(value: unknown): value is ReaderSettings {
  return (
    isRecord(value) &&
    Object.keys(value).length === READER_SETTING_FIELDS.length &&
    READER_SETTING_FIELDS.every((field) =>
      Object.prototype.hasOwnProperty.call(value, field),
    ) &&
    validateSettings(value).ok
  );
}
export function mergeSettings(
  current: ReaderSettings,
  patch: ReaderSettingsPatch,
): ReaderSettings {
  return { ...current, ...patch };
}
