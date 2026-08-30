import { describe, expect, it } from 'vitest';

import { migrateEnvelope } from '../../../src/infrastructure/storage/migrations';

describe('state migrations', () => {
  it('applies validated version-by-version transformations', () => {
    const result = migrateEnvelope<{ value: number }>(
      {
        schemaVersion: 1,
        version: 2,
        generation: 3,
        updatedAt: 4,
        data: { value: 1 },
      },
      3,
      new Map([
        [
          1,
          (envelope) => ({ ...envelope, schemaVersion: 2, data: { value: 2 } }),
        ],
        [
          2,
          (envelope) => ({ ...envelope, schemaVersion: 3, data: { value: 3 } }),
        ],
      ]),
    );
    expect(result.schemaVersion).toBe(3);
    expect(result.data.value).toBe(3);
  });

  it('fails closed when a migration is missing', () => {
    expect(() =>
      migrateEnvelope(
        { schemaVersion: 1, version: 0, generation: 0, updatedAt: 0, data: {} },
        2,
        new Map(),
      ),
    ).toThrow('Missing migration');
  });
});
