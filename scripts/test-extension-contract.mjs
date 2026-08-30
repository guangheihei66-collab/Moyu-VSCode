import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
}
