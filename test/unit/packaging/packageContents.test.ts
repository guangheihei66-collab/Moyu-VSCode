import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_VSIX_ENTRIES,
  validateVsixEntries,
} from '../../../scripts/verify-package.mjs';
import { findSecretPatterns } from '../../../scripts/scan-package-secrets.mjs';

describe('VSIX package content contract', () => {
  it('pins the approved UI redesign release version', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version: string };
    expect(manifest.version).toBe('0.2.0');
  });

  it('does not flag ordinary dependency properties as credentials', () => {
    expect(
      findSecretPatterns('const options = { password: encodePassword };'),
    ).toEqual([]);
    expect(findSecretPatterns('API_KEY = "not-a-real-secret-value"')).toContain(
      'secret assignment',
    );
  });

  it('requires both main Webview and Sidebar runtime assets', () => {
    expect(REQUIRED_VSIX_ENTRIES).toEqual(
      expect.arrayContaining([
        'extension/dist/webview/main.js',
        'extension/dist/webview/main.css',
        'extension/dist/webview/sidebar.js',
        'extension/dist/webview/sidebar.css',
      ]),
    );
  });

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
