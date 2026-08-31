import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

function readBuildScript(): string {
  return readFileSync(resolve(workspaceRoot, 'esbuild.mjs'), 'utf8');
}

describe('esbuild output contract', () => {
  it('builds the Extension Host as Node 20.18 CommonJS', () => {
    const buildScript = readBuildScript();

    expect(buildScript).toContain("platform: 'node'");
    expect(buildScript).toContain("target: 'node20.18'");
    expect(buildScript).toContain("format: 'cjs'");
    expect(buildScript).toContain("outfile: 'dist/extension.js'");
  });

  it('builds the Webview for Chromium 128', () => {
    const buildScript = readBuildScript();

    expect(buildScript).toContain("platform: 'browser'");
    expect(buildScript).toContain("target: 'chrome128'");
    expect(buildScript).toContain("outfile: 'dist/webview/main.js'");
    expect(buildScript).toContain("outfile: 'dist/webview/main.css'");
    expect(buildScript).toContain("outfile: 'dist/webview/sidebar.js'");
    expect(buildScript).toContain("outfile: 'dist/webview/sidebar.css'");
  });
});
