import { strict as assert } from 'node:assert';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

import { BookshelfService } from '../../../src/application/books/BookshelfService';
import { Game2048Service } from '../../../src/application/game2048/Game2048Service';
import { EncodingSelectionService } from '../../../src/application/reader/EncodingSelectionService';
import { ReaderService } from '../../../src/application/reader/ReaderService';
import { createNodeFileStatProvider } from '../../../src/infrastructure/filesystem/fileIdentity';
import { EpubParser } from '../../../src/infrastructure/epub/EpubParser';
import { EpubCache } from '../../../src/infrastructure/epub/EpubCache';
import { EpubReaderService } from '../../../src/application/reader/EpubReaderService';
import { EpubPresentationAdapter } from '../../../src/extension/panel/EpubPresentationAdapter';
import type { BookMetadata } from '../../../src/domain/books/types';
import { BookshelfRepository } from '../../../src/infrastructure/storage/bookshelfRepository';
import { GameRepository } from '../../../src/infrastructure/storage/gameRepository';
import { ProgressRepository } from '../../../src/infrastructure/storage/progressRepository';
import { IndexStore } from '../../../src/infrastructure/txt/indexStore';
import { TxtBlockReader } from '../../../src/infrastructure/txt/TxtBlockReader';
import { TxtIndexer } from '../../../src/infrastructure/txt/TxtIndexer';

export async function runRestartRecoveryAcceptance(): Promise<void> {
  await vscode.commands.executeCommand('moyu.open2048');
  const fixtureRoot = process.env.MOYU_TEST_FIXTURE_ROOT;
  assert.ok(fixtureRoot, 'The isolated fixture root is not configured.');

  const repository = new GameRepository(join(fixtureRoot, 'global-storage'));
  const firstService = new Game2048Service(
    repository,
    () => 0,
    () => 1_700_000_000_000,
    () => 'acceptance-session-1',
  );
  const saved = await firstService.newGame(0);
  const restored = await new Game2048Service(repository).load();

  assert.deepEqual(restored?.data.state, saved.data.state);
}

export async function runBookImportReadAcceptance(): Promise<void> {
  const fixtureRoot = process.env.MOYU_TEST_FIXTURE_ROOT;
  const txtPath = process.env.MOYU_TEST_TXT_BOOK;
  const epubPath = process.env.MOYU_TEST_EPUB_BOOK;
  assert.ok(fixtureRoot, 'The isolated fixture root is not configured.');
  assert.ok(txtPath, 'The TXT fixture is not configured.');
  assert.ok(epubPath, 'The EPUB fixture is not configured.');

  const bookshelfRepository = new BookshelfRepository(
    join(fixtureRoot, 'global-storage'),
  );
  const bookshelf = new BookshelfService(bookshelfRepository, {
    fileStats: createNodeFileStatProvider(),
    uuid: () => 'acceptance-book-1',
    clock: () => 1_700_000_000_001,
  });
  const book = await bookshelf.import(txtPath);
  const imported = await bookshelf.list();
  const encoding = new EncodingSelectionService(bookshelfRepository);
  const confirmed = await encoding.confirmEncoding(
    book.id,
    'utf8',
    imported?.version ?? 0,
  );
  const indexes = new IndexStore(join(fixtureRoot, 'global-storage'));
  const index = await new TxtIndexer({
    store: indexes,
    blockTargetChars: 1,
  }).build(confirmed, new AbortController().signal);
  assert.ok(
    index.blocks.length >= 2,
    'The TXT acceptance fixture must produce at least two readable blocks.',
  );
  const provider = async (bookId: string) =>
    bookId === confirmed.id ? confirmed : undefined;
  const reader = new ReaderService({
    bookProvider: provider,
    progress: new ProgressRepository(join(fixtureRoot, 'global-storage')),
    blockReader: new TxtBlockReader({
      bookProvider: provider,
      indexStore: indexes,
    }),
  });
  const opened = await reader.open(book.id);
  assert.ok(opened.locator, 'The imported TXT book did not produce an anchor.');
  const batch = await reader.readBlocks(book.id, opened.locator, 'after', 4);
  assert.match(
    batch.blocks.map((block) => block.paragraphs.join(' ')).join(' '),
    /第二段文本/,
  );

  const epub = await new EpubParser().parse({ fsPath: epubPath });
  assert.equal(epub.chapters.length, 1);
  assert.match(epub.chapters[0]?.paragraphs.join(' ') ?? '', /isolated EPUB/);

  const epubStat = await stat(epubPath);
  const epubBook: BookMetadata = {
    id: 'acceptance-epub-1',
    title: 'Isolated EPUB',
    uri: epubPath,
    type: 'epub',
    fingerprint: 'acceptance-epub-fingerprint',
    size: epubStat.size,
    modifiedAt: Math.trunc(epubStat.mtimeMs),
    addedAt: 1_700_000_000_002,
    metadataVersion: 1,
  };
  const epubStorage = join(fixtureRoot, 'epub-global-storage');
  const epubProgress = new ProgressRepository(epubStorage);
  const epubParser = new EpubParser();
  const epubCache = new EpubCache(epubStorage);
  const epubReader = new EpubReaderService({
    parser: epubParser,
    cache: epubCache,
    progress: epubProgress,
    bookProvider: async (bookId) =>
      bookId === epubBook.id ? epubBook : undefined,
  });
  const epubPresentation = new EpubPresentationAdapter({
    reader: epubReader,
    parser: epubParser,
    cache: epubCache,
    progress: epubProgress,
    bookProvider: async (bookId) =>
      bookId === epubBook.id ? epubBook : undefined,
  });
  assert.deepEqual(await epubPresentation.listChapters(epubBook.id), {
    bookId: epubBook.id,
    chapters: [{ chapterId: 'chapter-1', title: 'chapter-1', position: 0 }],
  });
  const openedEpub = await epubPresentation.open(epubBook.id);
  assert.equal(openedEpub.type, 'epub');
  assert.equal(openedEpub.anchor, null);
  const openedChapter = await epubPresentation.openChapter(
    epubBook.id,
    'chapter-1',
  );
  assert.match(openedChapter.paragraphs.join(' '), /isolated EPUB/);
  assert.equal(
    openedChapter.paragraphs.some((paragraph) => /<\/?[a-z]/i.test(paragraph)),
    false,
    'EPUB presentation output must contain text paragraphs, not markup.',
  );
}
