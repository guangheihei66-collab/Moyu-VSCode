import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

function readManifest(): {
  activationEvents: string[];
  engines: { vscode: string };
  main: string;
  contributes: {
    views: Record<string, Array<{ id: string; name: string; type?: string }>>;
  };
} {
  return JSON.parse(
    readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
  ) as ReturnType<typeof readManifest>;
}

function readActivationSource(): string {
  return readFileSync(
    resolve(workspaceRoot, 'src/extension/activation.ts'),
    'utf8',
  );
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

  it('declares the Sidebar as a webview with the exact runtime registration ID', () => {
    const manifest = readManifest();
    const sidebar = manifest.contributes.views.moyu?.find(
      (view) => view.id === 'moyu.sidebar',
    );
    const registration = readActivationSource().match(
      /registerWebviewViewProvider\(\s*['"]([^'"]+)['"]/,
    )?.[1];

    expect(sidebar).toBeDefined();
    expect(sidebar?.type).toBe('webview');
    expect(registration).toBeDefined();
    expect(sidebar?.id).toBe(registration);
  });
});
