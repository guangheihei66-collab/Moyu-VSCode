import { describe, expect, it } from 'vitest';

import {
  REQUIRED_VSIX_ENTRIES,
  validateVsixEntries,
} from '../../../scripts/verify-package.mjs';

describe('VSIX package content contract', () => {
  it('accepts the approved runtime-only archive shape', () => {
    const entries = [...REQUIRED_VSIX_ENTRIES];

    expect(() => validateVsixEntries(entries)).not.toThrow();
  });

  it('rejects development files, secrets, and unapproved archive paths', () => {
    expect(() =>
      validateVsixEntries([
        ...REQUIRED_VSIX_ENTRIES,
        'extension/node_modules/dependency/index.js',
        'extension/test/fixtures/storage/state.json',
        'extension/.env',
        'extension/.git/config',
        'extension/README.private.md',
      ]),
    ).toThrow(/Forbidden VSIX entry/);
  });
});
