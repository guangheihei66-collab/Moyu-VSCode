import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('reader and settings theme tokens', () => {
  it('defines shared layout tokens and imports them before feature styles', async () => {
    const tokensCss = await readFile('webview/styles/tokens.css', 'utf8');
    const baseCss = await readFile('webview/styles/base.css', 'utf8');
    const componentsCss = await readFile(
      'webview/components/components.css',
      'utf8',
    );

    for (const token of [
      '--moyu-space-1',
      '--moyu-space-2',
      '--moyu-space-3',
      '--moyu-space-4',
      '--moyu-space-5',
      '--moyu-space-6',
      '--moyu-radius-small',
      '--moyu-radius-control',
      '--moyu-control-height',
      '--moyu-content-max-width',
      '--moyu-reader-width',
      '--moyu-motion-fast',
      '--moyu-motion-normal',
    ]) {
      expect(tokensCss).toContain(token);
    }
    expect(baseCss).toContain("@import './tokens.css';");
    expect(baseCss).toContain("@import '../components/components.css';");
    expect(tokensCss).toContain('--vscode-focusBorder');
    expect(componentsCss).toContain('var(--moyu-focus)');
    expect(tokensCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(componentsCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('consumes all three live reader setting variables with VS Code colors', async () => {
    const readerCss = await readFile('webview/reader/reader.css', 'utf8');
    expect(readerCss).toMatch(/font-size:\s*var\(--moyu-font-size\)/);
    expect(readerCss).toMatch(/line-height:\s*var\(--moyu-line-height\)/);
    expect(readerCss).toMatch(
      /width:\s*min\(100%,\s*var\(--moyu-content-width\)\)/,
    );
    expect(readerCss).toContain('var(--vscode-editor-foreground)');
    expect(readerCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('gives settings controls visible focus, contrast, and reduced-motion hooks using theme tokens', async () => {
    const settingsCss = await readFile('webview/settings/settings.css', 'utf8');
    expect(settingsCss).toMatch(/input:focus-visible/);
    expect(settingsCss).toMatch(/select:focus-visible/);
    expect(settingsCss).toContain('var(--vscode-focusBorder)');
    expect(settingsCss).toContain('var(--vscode-contrastBorder)');
    expect(settingsCss).toMatch(/vscode-high-contrast/);
    expect(settingsCss).toContain('prefers-contrast: more');
    expect(settingsCss).toContain('prefers-reduced-motion: reduce');
    expect(settingsCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
