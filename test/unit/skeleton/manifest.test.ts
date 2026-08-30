import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

function readManifest(): {
  activationEvents: string[];
  engines: { vscode: string };
  main: string;
} {
  return JSON.parse(
    readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
  ) as ReturnType<typeof readManifest>;
}

describe('extension manifest contract', () => {
  it('declares the approved VS Code engine and CommonJS extension entry', () => {
    const manifest = readManifest();

    expect(manifest.engines.vscode).toBe('^1.96.0');
    expect(manifest.main).toBe('./dist/extension.js');
  });

  it('uses at least one explicit activation event and never wildcard activation', () => {
    const manifest = readManifest();

    expect(manifest.activationEvents.length).toBeGreaterThan(0);
    expect(manifest.activationEvents).not.toContain('*');
  });
});
