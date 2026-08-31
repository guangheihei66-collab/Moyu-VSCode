import * as vscode from 'vscode';
import {
  confirmBookshelfRemoval,
  pickBookUri,
  registerCommands,
  selectBookEncoding,
} from './commands';
import { ContextKeys } from './contextKeys';
import { MoyuSidebarProvider } from './sidebar/MoyuSidebarProvider';
import { PanelController } from './panel/PanelController';
import { PanelRegistry } from './panel/PanelRegistry';
import { PanelSerializer } from './panel/PanelSerializer';
import { PresentationSnapshotProvider } from './panel/PresentationSnapshotProvider';
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
import { WebviewSessionRegistry } from '../application/sessions/WebviewSessionRegistry';
import { RefreshCoordinator } from '../application/sessions/RefreshCoordinator';
import type { BookMetadata } from '../domain/books/types';

export function activate(context: vscode.ExtensionContext): void {
  const windowId = String(vscode.env.sessionId);
  const contextKeys = new ContextKeys();
  const preferencesRepository = new PreferencesRepository(
    context.globalStorageUri.fsPath,
  );
  const settings = new ReaderSettingsService(preferencesRepository);
  const boss = new BossModeService();
  const bookshelfRepository = new BookshelfRepository(
    context.globalStorageUri.fsPath,
  );
  const progress = new ProgressRepository(context.globalStorageUri.fsPath);
  const txtIndexes = new IndexStore(context.globalStorageUri.fsPath);
  const epubCache = new EpubCache(context.globalStorageUri.fsPath);
  const fileStats = createNodeFileStatProvider();
  const removeDerived = async (bookId: string): Promise<void> => {
    await Promise.all([txtIndexes.remove(bookId), epubCache.remove(bookId)]);
  };
  const bookshelf = new BookshelfService(bookshelfRepository, {
    fileStats,
    onIndexInvalidated: removeDerived,
    onBookRemoved: async (bookId) => {
      await Promise.all([progress.remove(bookId), removeDerived(bookId)]);
    },
  });
  const encoding = new EncodingSelectionService(bookshelfRepository);
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
  const gameRepository = new GameRepository(context.globalStorageUri.fsPath);
  const game = new Game2048Service(gameRepository);
  const presentation = new PresentationSnapshotProvider({
    bookshelf,
    progress,
    game,
    fileStats,
  });
  const bookOperations = {
    import: async (uri?: string): Promise<void> => {
      const selected = uri ?? (await pickBookUri(vscode.window));
      if (selected === undefined) return;
      await bookshelf.import(selected);
    },
    relocate: async (bookId: string, uri?: string): Promise<void> => {
      const book = await bookProvider(bookId);
      if (book === undefined) throw new Error('Book was not found.');
      const selected =
        uri ?? (await pickBookUri(vscode.window, book.type))?.toString();
      if (selected === undefined) return;
      await bookshelf.relocate(bookId, selected);
    },
    remove: async (bookId: string): Promise<void> => {
      const book = await bookProvider(bookId);
      if (book === undefined) throw new Error('Book was not found.');
      if (!(await confirmBookshelfRemoval(vscode.window, book.title))) return;
      await bookshelf.remove(bookId);
    },
    selectEncoding: async (bookId: string): Promise<void> => {
      const book = await bookProvider(bookId);
      if (book === undefined) throw new Error('Book was not found.');
      const state = await bookshelf.list();
      await selectBookEncoding(
        vscode.window,
        encoding,
        book,
        state?.version ?? 0,
      );
    },
  };
  const sessionRegistry = new WebviewSessionRegistry();
  const refreshCoordinator = new RefreshCoordinator({
    bookshelf: bookshelfRepository,
    reader: progress,
    game2048: gameRepository,
    settings: preferencesRepository,
  });
  const registry = new PanelRegistry(
    (_, onStateChange) =>
      new PanelController(
        context,
        settings,
        onStateChange,
        { reader, game, presentation, books: bookOperations },
        { sessionRegistry, refreshCoordinator },
      ),
    contextKeys,
    () => boss.reset(),
  );
  const sidebarProvider = new MoyuSidebarProvider(
    registry,
    windowId,
    context.extensionUri,
  );
  registerCommands(
    context,
    registry,
    windowId,
    {
      bookshelf,
      encoding,
      boss: { service: boss, settings },
    },
    (section) => {
      if (
        section === 'home' ||
        section === 'books' ||
        section === 'game2048' ||
        section === 'settings'
      ) {
        sidebarProvider.setActiveSection(section);
      }
    },
  );
  const lifecycleSubscriptions: vscode.Disposable[] = [
    sidebarProvider,
    vscode.window.registerWebviewViewProvider('moyu.sidebar', sidebarProvider),
    vscode.window.registerWebviewPanelSerializer(
      'moyu.main',
      new PanelSerializer(registry, windowId, context.extensionUri),
    ),
  ];
  if (process.env.MOYU_TEST_SIDEBAR_PROBE === '1') {
    lifecycleSubscriptions.push(
      vscode.commands.registerCommand('moyu.__testSidebarStatus', () => ({
        registered: true,
        resolved: sidebarProvider.isResolved,
      })),
    );
  }
  context.subscriptions.push(...lifecycleSubscriptions);
}

export function deactivate(): void {}
