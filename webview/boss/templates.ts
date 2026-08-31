import type { BossTemplate } from '../../src/domain/reader/settings';
export { BOSS_PANEL_TITLES } from '../../src/domain/boss/types';

export const BOSS_TEMPLATES: Readonly<Record<BossTemplate, string>> =
  Object.freeze({
    typescript: `import { ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext): void {
  context.subscriptions.push();
}

export function deactivate(): void {}`,
    json: `{
  "editor.formatOnSave": true,
  "editor.minimap.enabled": false,
  "files.trimTrailingWhitespace": true,
  "typescript.updateImportsOnFileMove.enabled": "always"
}`,
    buildLog: `[23:41:08] Starting incremental compilation...
[23:41:09] Checking TypeScript sources
[23:41:10] Bundling extension host
[23:41:10] Bundling webview assets
[23:41:11] Build completed successfully`,
  });
