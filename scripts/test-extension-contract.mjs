import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const extensionEntry = fileURLToPath(
  new URL('../dist/extension.js', import.meta.url),
);

if (!existsSync(extensionEntry)) {
  console.error(
    'Compiled extension entry is missing. Run npm run build first.',
  );
  process.exitCode = 1;
} else {
  console.log('Compiled extension entry exists.');
  const grepIndex = process.argv.indexOf('--grep');
  const pattern = grepIndex >= 0 ? process.argv[grepIndex + 1] : undefined;
  const vitest = fileURLToPath(
    new URL('../node_modules/vitest/vitest.mjs', import.meta.url),
  );
  const args = [vitest, 'run', 'test/extension'];
  if (pattern) args.push('--testNamePattern', pattern);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
