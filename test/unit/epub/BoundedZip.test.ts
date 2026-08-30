import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BoundedZip } from '../../../src/infrastructure/epub/BoundedZip';
import { buildFixture } from '../../fixtures/epub/buildFixture';

const opened: BoundedZip[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((archive) => archive.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('BoundedZip', () => {
  it('opens bounded entries and reads their bytes', async () => {
    const archive = await openFixture([
      { name: 'META-INF/container.xml', text: '<container/>' },
      { name: 'OPS/', text: '' },
      { name: 'OPS/chapter.xhtml', text: '<p>Safe</p>' },
    ]);
    expect(archive.entries).toEqual([
      'META-INF/container.xml',
      'OPS/chapter.xhtml',
    ]);
    await expect(archive.read('OPS/chapter.xhtml')).resolves.toEqual(
      new TextEncoder().encode('<p>Safe</p>'),
    );
  });

  it('rejects traversal and absolute entry paths', async () => {
    await expect(
      openFixture([{ name: '../escape', text: 'x' }]),
    ).rejects.toMatchObject({
      code: 'EPUB_UNSAFE_PATH',
    });
    await expect(
      openFixture([{ name: '/absolute', text: 'x' }]),
    ).rejects.toMatchObject({
      code: 'EPUB_UNSAFE_PATH',
    });
  });

  it('rejects an oversized source before ZIP parsing', async () => {
    const directory = await createTemporaryDirectory();
    const archivePath = path.join(directory, 'oversized.epub');
    await writeFile(archivePath, '');
    await truncate(archivePath, 256 * 1024 * 1024 + 1);
    await expect(
      BoundedZip.open({ fsPath: archivePath }),
    ).rejects.toMatchObject({
      code: 'EPUB_LIMIT_EXCEEDED',
    });
  });

  it('rejects suspicious compression ratios before expansion', async () => {
    await expect(
      openFixture([{ name: 'OPS/bomb.xhtml', text: 'A'.repeat(256 * 1024) }]),
    ).rejects.toMatchObject({ code: 'EPUB_LIMIT_EXCEEDED' });
  });
});

async function openFixture(
  entries: { name: string; text: string }[],
): Promise<BoundedZip> {
  const directory = await createTemporaryDirectory();
  const archivePath = path.join(directory, 'fixture.epub');
  await writeFile(archivePath, await buildFixture(entries));
  const archive = await BoundedZip.open({ fsPath: archivePath });
  opened.push(archive);
  return archive;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'moyu-epub-'));
  temporaryDirectories.push(directory);
  return directory;
}
