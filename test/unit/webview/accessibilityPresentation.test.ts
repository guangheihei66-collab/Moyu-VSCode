import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const FEATURE_STYLES = [
  'webview/components/components.css',
  'webview/sidebar/sidebar.css',
  'webview/home/home.css',
  'webview/books/bookshelf.css',
  'webview/reader/reader.css',
  'webview/game2048/game2048.css',
  'webview/settings/settings.css',
  'webview/boss/boss.css',
] as const;

const NARROW_LAYOUT_STYLES = [
  'webview/sidebar/sidebar.css',
  'webview/home/home.css',
  'webview/books/bookshelf.css',
  'webview/reader/reader.css',
  'webview/game2048/game2048.css',
] as const;

describe('cross-surface presentation accessibility and themes', () => {
  it('freezes the shared geometry tokens and aliases theme-sensitive values', async () => {
    const css = await readFile('webview/styles/tokens.css', 'utf8');
    expect(css).toMatch(/--moyu-space-1:\s*4px/);
    expect(css).toMatch(/--moyu-space-2:\s*8px/);
    expect(css).toMatch(/--moyu-space-3:\s*12px/);
    expect(css).toMatch(/--moyu-space-4:\s*16px/);
    expect(css).toMatch(/--moyu-space-5:\s*24px/);
    expect(css).toMatch(/--moyu-space-6:\s*32px/);
    expect(css).toMatch(/--moyu-radius-small:\s*4px/);
    expect(css).toMatch(/--moyu-radius-control:\s*6px/);
    expect(css).toMatch(/--moyu-motion-fast:\s*120ms/);
    expect(css).toMatch(/--moyu-motion-normal:\s*180ms/);
    expect(css).toMatch(/--moyu-content-max-width:\s*1100px/);
    expect(css).toMatch(/--moyu-reader-width:\s*720px/);
    expect(css).toContain('--vscode-editor-background');
    expect(css).toContain('--vscode-editor-foreground');
    expect(css).toContain('--vscode-focusBorder');
    expect(css).toContain('--vscode-contrastBorder');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('keeps feature styles free of private colors, gradients, and network assets', async () => {
    const styles = await Promise.all(
      FEATURE_STYLES.map(
        async (path) => [path, await readFile(path, 'utf8')] as const,
      ),
    );
    for (const [path, css] of styles) {
      expect(css, path).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, path).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i);
      expect(css, path).not.toMatch(/(?:linear|radial)-gradient/i);
      expect(css, path).not.toMatch(/(?:https?:)?\/\//i);
      expect(css, path).not.toMatch(/@font-face|font-family:[^;]*url\(/i);
    }
  });

  it('provides contrast and reduced-motion hooks for every feature surface', async () => {
    const styles = await Promise.all(
      FEATURE_STYLES.map(
        async (path) => [path, await readFile(path, 'utf8')] as const,
      ),
    );
    for (const [path, css] of styles) {
      expect(css, `${path} forced colors`).toContain(
        '@media (forced-colors: active)',
      );
      expect(css, `${path} contrast`).toContain(
        '@media (prefers-contrast: more)',
      );
      expect(css, `${path} motion`).toContain(
        '@media (prefers-reduced-motion: reduce)',
      );
    }
  });

  it('keeps narrow layouts fluid and gives global controls a visible focus path', async () => {
    const base = await readFile('webview/styles/base.css', 'utf8');
    expect(base).toContain('overflow-x: hidden');
    expect(base).toMatch(/button:focus-visible/);
    expect(base).toMatch(/input:focus-visible/);
    expect(base).toMatch(/select:focus-visible/);
    for (const path of NARROW_LAYOUT_STYLES) {
      const css = await readFile(path, 'utf8');
      expect(css, path).toMatch(/@media\s*\(max-width:/);
      expect(css, path).not.toMatch(/(?:width|flex-basis):\s*1200px/);
    }
  });

  it('retains semantic state hooks and safe bounded recovery actions', async () => {
    const [sidebar, drawer, game, settings, shell, errorView] =
      await Promise.all([
        readFile('webview/sidebar/SidebarView.ts', 'utf8'),
        readFile('webview/reader/ChapterDrawer.ts', 'utf8'),
        readFile('webview/game2048/Game2048View.ts', 'utf8'),
        readFile('webview/settings/SettingsView.ts', 'utf8'),
        readFile('webview/shell/app.ts', 'utf8'),
        readFile('webview/shell/ErrorView.ts', 'utf8'),
      ]);
    expect(sidebar).toContain("aria-current', 'page'");
    expect(drawer).toContain("aria-expanded', 'true'");
    expect(drawer).toContain("aria-controls', id");
    expect(game).toContain('aria-keyshortcuts');
    expect(settings).toContain("aria-live', 'polite'");
    expect(shell).toContain("'role', 'main'");
    expect(errorView).toContain('RECOVERY_ACTIONS');
    expect(errorView).toContain('data-recovery-action');
    expect(errorView).not.toContain('innerHTML');
  });
});
