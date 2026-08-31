import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ContextKeys } from './contextKeys';
import { MoyuSidebarProvider } from './sidebar/MoyuSidebarProvider';
import { PanelController } from './panel/PanelController';
import { PanelRegistry } from './panel/PanelRegistry';
import { PanelSerializer } from './panel/PanelSerializer';
import { BookshelfService } from '../application/books/BookshelfService';
import { createNodeFileStatProvider } from '../infrastructure/filesystem/fileIdentity';
import { BookshelfRepository } from '../infrastructure/storage/bookshelfRepository';
import { EncodingSelectionService } from '../application/reader/EncodingSelectionService';
import { ProgressRepository } from '../infrastructure/storage/progressRepository';
import { IndexStore } from '../infrastructure/txt/indexStore';
import { TxtBlockReader } from '../infrastructure/txt/TxtBlockReader';
import { EpubCache } from '../infrastructure/epub/EpubCache';
import { ReaderSettingsService } from '../application/reader/ReaderSettingsService';
import { ReaderService } from '../application/reader/ReaderService';
import { PreferencesRepository } from '../infrastructure/storage/preferencesRepository';
import { BossModeService } from '../application/boss/BossModeService';
import { Game2048Service } from '../application/game2048/Game2048Service';
import { GameRepository } from '../infrastructure/storage/gameRepository';
import type { BookMetadata } from '../domain/books/types';

export function activate(context: vscode.ExtensionContext): void {
  const windowId = String(vscode.env.sessionId);
  const contextKeys = new ContextKeys();
  const settings = new ReaderSettingsService(
    new PreferencesRepository(context.globalStorageUri.fsPath),
  );
  const boss = new BossModeService();
  const bookshelfRepository = new BookshelfRepository(
    context.globalStorageUri.fsPath,
  );
  const progress = new ProgressRepository(context.globalStorageUri.fsPath);
  const txtIndexes = new IndexStore(context.globalStorageUri.fsPath);
  const epubCache = new EpubCache(context.globalStorageUri.fsPath);
  const removeDerived = async (bookId: string): Promise<void> => {
    await Promise.all([txtIndexes.remove(bookId), epubCache.remove(bookId)]);
  };
  const bookshelf = new BookshelfService(bookshelfRepository, {
    fileStats: createNodeFileStatProvider(),
    onIndexInvalidated: removeDerived,
    onBookRemoved: async (bookId) => {
      await Promise.all([progress.remove(bookId), removeDerived(bookId)]);
    },
  });
  const bookProvider = async (
    bookId: string,
  ): Promise<BookMetadata | undefined> => {
    const book = (await bookshelf.list())?.data.books.find(
      (candidate) => candidate.id === bookId,
    );
    const fingerprint = book?.fingerprint;
    const size = book?.size;
    const modifiedAt = book?.modifiedAt;
    if (
      book === undefined ||
      typeof fingerprint !== 'string' ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      typeof modifiedAt !== 'number' ||
      !Number.isSafeInteger(modifiedAt) ||
      modifiedAt < 0
    ) {
      return undefined;
    }
    return {
      ...book,
      fingerprint,
      size,
      modifiedAt,
    } as BookMetadata;
  };
  const reader = new ReaderService({
    bookProvider,
    progress,
    blockReader: new TxtBlockReader({
      bookProvider,
      indexStore: txtIndexes,
    }),
  });
  const game = new Game2048Service(
    new GameRepository(context.globalStorageUri.fsPath),
  );
  const registry = new PanelRegistry(
    (_, onStateChange) =>
      new PanelController(context, settings, onStateChange, { reader, game }),
    contextKeys,
    () => boss.reset(),
  );
  registerCommands(context, registry, windowId, {
    bookshelf,
    encoding: new EncodingSelectionService(bookshelfRepository),
    boss: { service: boss, settings },
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'moyu.sidebar',
      new MoyuSidebarProvider(registry, windowId),
    ),
    vscode.window.registerWebviewPanelSerializer(
      'moyu.main',
      new PanelSerializer(registry, windowId, context.extensionUri),
    ),
  );
}

export function deactivate(): void {}
