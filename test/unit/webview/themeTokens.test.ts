import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('reader and settings theme tokens', () => {
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
