import * as vscode from 'vscode';
import type { AppSection } from '../shared/protocol/messages';
import type { PanelRegistry } from './panel/PanelRegistry';
import type { BookshelfService } from '../application/books/BookshelfService';
import type { BookMetadata, BookType } from '../domain/books/types';
import type { EncodingSelectionService } from '../application/reader/EncodingSelectionService';
import type { TxtEncoding } from '../domain/books/types';
import type { BossModeService } from '../application/boss/BossModeService';
import type { ReaderSettingsService } from '../application/reader/ReaderSettingsService';

interface EncodingChoice extends vscode.QuickPickItem {
  encoding: TxtEncoding;
}

export interface BookWorkflowWindow {
  showOpenDialog(
    options: vscode.OpenDialogOptions,
  ): Thenable<readonly vscode.Uri[] | undefined>;
  showWarningMessage<T extends string>(
    message: string,
    options: vscode.MessageOptions,
    ...items: T[]
  ): Thenable<T | undefined>;
  showQuickPick(
    items: readonly EncodingChoice[],
    options: vscode.QuickPickOptions,
  ): Thenable<EncodingChoice | undefined>;
}

export interface BookWorkflows {
  bookshelf: BookshelfService;
  encoding?: EncodingSelectionService;
  window?: BookWorkflowWindow;
  boss?: {
    service: BossModeService;
    settings: ReaderSettingsService;
  };
}

export async function pickBookUri(
  window: BookWorkflowWindow,
  type?: BookType,
): Promise<vscode.Uri | undefined> {
  const extensions = type === undefined ? ['txt', 'epub'] : [type];
  const selected = await window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: type === undefined ? 'Import book' : 'Relocate book',
    filters: { 'TXT and EPUB books': extensions },
  });
  return selected?.[0];
}

export async function confirmBookshelfRemoval(
  window: BookWorkflowWindow,
  title: string,
): Promise<boolean> {
  const action = 'Remove from bookshelf';
  return (
    (await window.showWarningMessage(
      `Remove “${title}” from the bookshelf? Moyu metadata, progress, and derived indexes will be removed. The original TXT/EPUB file will not be deleted.`,
      { modal: true },
      action,
    )) === action
  );
}

export async function selectBookEncoding(
  window: BookWorkflowWindow,
  service: EncodingSelectionService,
  book: BookMetadata,
  baseVersion: number,
): Promise<BookMetadata | undefined> {
  if (book.type !== 'txt') return undefined;
  const encodings: readonly TxtEncoding[] = [
    'utf8',
    'utf16le',
    'utf16be',
    'gb18030',
    'gbk',
  ];
  const choices = await Promise.all(
    encodings.map(
      async (encoding): Promise<EncodingChoice> => ({
        label: encoding.toUpperCase(),
        detail: await service
          .previewEncoding(book.uri, encoding)
          .catch(() => 'Preview unavailable'),
        encoding,
      }),
    ),
  );
  const selected = await window.showQuickPick(choices, {
    title: `Select encoding for ${book.title}`,
    placeHolder: 'Review the text preview before confirming',
  });
  return selected === undefined
    ? undefined
    : service.confirmEncoding(book.id, selected.encoding, baseVersion);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  registry: PanelRegistry,
  windowId: string,
  workflows?: BookWorkflows,
  onNavigate?: (section: AppSection) => void,
): void {
  const open = (section: AppSection) => {
    onNavigate?.(section);
    return registry.openOrReveal(windowId, section);
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('moyu.open', () => open('books')),
    vscode.commands.registerCommand('moyu.openBooks', () => open('books')),
    vscode.commands.registerCommand('moyu.openSettings', () =>
      open('settings'),
    ),
    vscode.commands.registerCommand('moyu.toggleBossMode', async () => {
      const panel = registry.get(windowId);
      if (panel?.isVisible !== true) return undefined;
      if (workflows?.boss === undefined) return undefined;
      const snapshot = await workflows.boss.settings.read();
      return workflows.boss.service.toggle(
        panel,
        snapshot.settings.bossTemplate,
      );
    }),
    vscode.commands.registerCommand('moyu.importBook', async () => {
      if (workflows === undefined) return undefined;
      const uri = await pickBookUri(workflows.window ?? vscode.window);
      return uri === undefined ? undefined : workflows.bookshelf.import(uri);
    }),
    vscode.commands.registerCommand(
      'moyu.relocateBook',
      async (book: BookMetadata) => {
        if (workflows === undefined) return undefined;
        const uri = await pickBookUri(
          workflows.window ?? vscode.window,
          book.type,
        );
        return uri === undefined
          ? undefined
          : workflows.bookshelf.relocate(book.id, uri);
      },
    ),
    vscode.commands.registerCommand(
      'moyu.removeBook',
      async (book: BookMetadata) => {
        if (
          workflows === undefined ||
          !(await confirmBookshelfRemoval(
            workflows.window ?? vscode.window,
            book.title,
          ))
        )
          return undefined;
        return workflows.bookshelf.remove(book.id);
      },
    ),
    vscode.commands.registerCommand(
      'moyu.selectBookEncoding',
      async (book: BookMetadata) => {
        if (workflows?.encoding === undefined) return undefined;
        const state = await workflows.bookshelf.list();
        return selectBookEncoding(
          workflows.window ?? vscode.window,
          workflows.encoding,
          book,
          state?.version ?? 0,
        );
      },
    ),
  );
}
