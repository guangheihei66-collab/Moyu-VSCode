import type { VersionedEnvelope } from '../../domain/persistence/envelope';

export type Migration<T> = (
  envelope: VersionedEnvelope<unknown>,
) => VersionedEnvelope<T>;

export function migrateEnvelope<T>(
  value: VersionedEnvelope<unknown>,
  targetSchemaVersion: number,
  migrations: ReadonlyMap<number, Migration<unknown>>,
): VersionedEnvelope<T> {
  if (!Number.isSafeInteger(targetSchemaVersion) || targetSchemaVersion < 1) {
    throw new TypeError('Invalid target schema version.');
  }
  let current = value;
  while (current.schemaVersion < targetSchemaVersion) {
    const previousVersion = current.schemaVersion;
    const migrate = migrations.get(current.schemaVersion);
    if (migrate === undefined) {
      throw new Error(
        `Missing migration from schema ${current.schemaVersion}.`,
      );
    }
    current = migrate(current);
    if (
      current.schemaVersion <= previousVersion ||
      current.schemaVersion > targetSchemaVersion
    ) {
      throw new Error('Migration must advance to the next supported schema.');
    }
  }
  if (current.schemaVersion !== targetSchemaVersion) {
    throw new Error('State schema is newer than this extension supports.');
  }
  return current as VersionedEnvelope<T>;
}

export function identityMigrations(): ReadonlyMap<number, Migration<unknown>> {
  return new Map();
}
