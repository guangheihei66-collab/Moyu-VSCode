import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EpubParser } from '../../../src/infrastructure/epub/EpubParser';
import { buildFixture } from '../../fixtures/epub/buildFixture';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((item) => rm(item, { recursive: true })),
  );
});

describe('EpubParser', () => {
  it('follows container and ordered spine while emitting text-only chapters', async () => {
    const file = await fixture();
    const index = await new EpubParser().parse({ fsPath: file });
    expect(index.chapters.map((chapter) => chapter.id)).toEqual([
      'chapter-2',
      'chapter-1',
    ]);
    expect(index.chapters[0]).toMatchObject({
      title: 'Second',
      paragraphs: ['Two', '[Image omitted]'],
    });
    expect(index.chapters[1]?.paragraphs).toEqual(['One']);
  });
});

export async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'moyu-epub-book-'));
  directories.push(directory);
  const file = path.join(directory, 'book.epub');
  await writeFile(
    file,
    await buildFixture([
      {
        name: 'META-INF/container.xml',
        text: '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      },
      {
        name: 'OPS/book.opf',
        text: '<package><metadata><title>Book</title></metadata><manifest><item id="chapter-1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-2"/><itemref idref="chapter-1"/></spine></package>',
      },
      { name: 'OPS/one.xhtml', text: '<html><body><p>One</p></body></html>' },
      {
        name: 'OPS/two.xhtml',
        text: '<html><head><title>Second</title></head><body><p>Two</p><img src="secret"/></body></html>',
      },
    ]),
  );
  return file;
}
