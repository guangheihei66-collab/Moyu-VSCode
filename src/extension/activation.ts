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
import { IndexStore } from '../infrastructure/txt/IndexStore';
import { EpubCache } from '../infrastructure/epub/EpubCache';
import { ReaderSettingsService } from '../application/reader/ReaderSettingsService';
import { PreferencesRepository } from '../infrastructure/storage/preferencesRepository';

export function activate(context: vscode.ExtensionContext): void {
  const windowId = String(vscode.env.sessionId);
  const contextKeys = new ContextKeys();
  const settings = new ReaderSettingsService(
    new PreferencesRepository(context.globalStorageUri.fsPath),
  );
  const registry = new PanelRegistry(
    (_, onStateChange) => new PanelController(context, settings, onStateChange),
    contextKeys,
  );
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
  registerCommands(context, registry, windowId, {
    bookshelf,
    encoding: new EncodingSelectionService(bookshelfRepository),
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
