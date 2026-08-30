export interface VersionedEnvelope<T> {
  schemaVersion: number;
  version: number;
  generation: number;
  updatedAt: number;
  data: T;
}

export class StateConflict extends Error {
  constructor(
    readonly code:
      | 'STATE_VERSION_CONFLICT'
      | 'GAME_SESSION_STALE' = 'STATE_VERSION_CONFLICT',
    message = 'The state changed in another window.',
  ) {
    super(message);
    this.name = 'StateConflict';
  }
}

export function isVersionedEnvelope<T>(
  value: unknown,
  dataGuard: (data: unknown) => data is T,
): value is VersionedEnvelope<T> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<VersionedEnvelope<unknown>>;
  return (
    Number.isSafeInteger(candidate.schemaVersion) &&
    candidate.schemaVersion >= 1 &&
    Number.isSafeInteger(candidate.version) &&
    candidate.version >= 0 &&
    Number.isSafeInteger(candidate.generation) &&
    candidate.generation >= 0 &&
    Number.isFinite(candidate.updatedAt) &&
    candidate.updatedAt >= 0 &&
    dataGuard(candidate.data)
  );
}

export function nextEnvelope<T>(
  current: VersionedEnvelope<T> | undefined,
  data: T,
  now: number,
  schemaVersion = current?.schemaVersion ?? 1,
): VersionedEnvelope<T> {
  return {
    schemaVersion,
    version: (current?.version ?? -1) + 1,
    generation: (current?.generation ?? -1) + 1,
    updatedAt: now,
    data,
  };
}
