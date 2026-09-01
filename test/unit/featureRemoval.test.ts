import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateHostRequest } from '../../src/shared/protocol/validate';

const projectRoot = resolve(process.cwd());

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(css|ts)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('Moyu 2048 removal contract', () => {
  it('removes game-specific identifiers from production source', () => {
    const forbidden = /game2048|Game2048|open2048|bestScore|hasGameSession/;
    const files = [
      ...sourceFiles(join(projectRoot, 'src')),
      ...sourceFiles(join(projectRoot, 'webview')),
    ];
    const matches = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden.test(source) ? [file] : [];
    });

    expect(matches).toEqual([]);
  });

  it('removes the 2048 command from the extension manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(projectRoot, 'package.json'), 'utf8'),
    ) as { contributes?: { commands?: { command: string }[] } };

    expect(
      manifest.contributes?.commands?.map(({ command }) => command),
    ).not.toContain('moyu.open2048');
  });

  it('rejects legacy game requests at the protocol boundary', () => {
    const result = validateHostRequest(
      {
        protocol: 1,
        id: 'legacy-request',
        sessionId: 'session-1',
        type: 'game2048/load',
        payload: {},
      },
      'session-1',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_REQUEST_TYPE');
  });
});
