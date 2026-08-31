import { build, context } from 'esbuild';

const extensionBuild = {
  bundle: true,
  entryPoints: ['src/extension/activation.ts'],
  external: ['vscode'],
  format: 'cjs',
  outfile: 'dist/extension.js',
  platform: 'node',
  sourcemap: true,
  target: 'node20.18',
};

const webviewScriptBuild = {
  bundle: true,
  entryPoints: ['webview/shell/main.ts'],
  outfile: 'dist/webview/main.js',
  platform: 'browser',
  sourcemap: true,
  target: 'chrome128',
};

const webviewStyleBuild = {
  bundle: true,
  entryPoints: ['webview/styles/base.css'],
  outfile: 'dist/webview/main.css',
  platform: 'browser',
  sourcemap: true,
  target: 'chrome128',
};

const sidebarScriptBuild = {
  bundle: true,
  entryPoints: ['webview/sidebar/main.ts'],
  outfile: 'dist/webview/sidebar.js',
  platform: 'browser',
  sourcemap: true,
  target: 'chrome128',
};

const sidebarStyleBuild = {
  bundle: true,
  entryPoints: ['webview/sidebar/sidebar.css'],
  outfile: 'dist/webview/sidebar.css',
  platform: 'browser',
  sourcemap: true,
  target: 'chrome128',
};

const builds = [
  extensionBuild,
  webviewScriptBuild,
  webviewStyleBuild,
  sidebarScriptBuild,
  sidebarStyleBuild,
];

if (process.argv.includes('--watch')) {
  await Promise.all(
    builds.map(async (options) => (await context(options)).watch()),
  );
  console.log('Watching extension and Webview sources.');
} else {
  await Promise.all(builds.map((options) => build(options)));
}
