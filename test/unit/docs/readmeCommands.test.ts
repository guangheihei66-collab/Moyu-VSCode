import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

function readReadme(): string {
  return readFileSync(resolve(workspaceRoot, 'README.md'), 'utf8');
}

describe('README user workflow contract', () => {
  it('documents installation, development, and the core V1 commands', () => {
    const readme = readReadme();

    expect(readme).toContain('F5');
    expect(readme).toContain('npm run build');
    expect(readme).toContain('npm run test:extension:min');
    expect(readme).toContain('npm run package');
    expect(readme).toContain('Ctrl+M');
    expect(readme).toContain('moyu.openBooks');
    expect(readme).toContain('moyu.open2048');
    expect(readme).toContain('moyu.openSettings');
  });

  it('documents source-file safety, local storage, and multi-window limits', () => {
    const readme = readReadme();

    expect(readme).toContain(
      'Remove from bookshelf never deletes the source file',
    );
    expect(readme).toContain('globalStorage');
    expect(readme).toContain('local-only');
    expect(readme).toContain('multi-window');
    expect(readme).toContain('encoding');
  });
});
