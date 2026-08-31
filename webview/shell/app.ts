import type { BossMode } from '../../src/domain/boss/types';
import {
  DEFAULT_READER_SETTINGS,
  type BossTemplate,
  type ReaderSettingsPatch,
  type ReaderSettingsSnapshot,
} from '../../src/domain/reader/settings';
import type {
  AppSection,
  BookshelfSnapshot,
  HomeSnapshot,
  LogicalLocator,
} from '../../src/shared/protocol/messages';
import { BossOverlay } from '../boss/BossOverlay';
import {
  BookshelfController,
  type BookshelfClient,
} from '../books/BookshelfController';
import { HomeController, type HomeAction } from '../home/HomeController';
import {
  Game2048Controller,
  type Game2048Transport,
} from '../game2048/Game2048Controller';
import {
  ReaderController,
  type ReaderTransport,
} from '../reader/ReaderController';
import type { ReaderAction } from '../reader/ReaderView';
import { SettingsView } from '../settings/SettingsView';
import {
  ModuleLifecycle,
  type ModuleBinding,
  type ModuleSnapshot,
} from './moduleLifecycle';
import { Router } from './router';

export interface SettingsClient {
  readSettings(): Promise<ReaderSettingsSnapshot>;
  updateSettings(
    baseVersion: number,
    patch: ReaderSettingsPatch,
  ): Promise<ReaderSettingsSnapshot>;
  readHome?(): Promise<HomeSnapshot>;
  readBooks?(): Promise<BookshelfSnapshot>;
  importBook?(): Promise<BookshelfSnapshot>;
  relocateBook?(bookId: string): Promise<BookshelfSnapshot>;
  selectBookEncoding?(bookId: string): Promise<BookshelfSnapshot>;
  removeBook?(bookId: string): Promise<BookshelfSnapshot>;
}

export interface ProductionModuleClient
  extends SettingsClient,
    ReaderTransport,
    Game2048Transport {}

function isProductionModuleClient(
  client: SettingsClient | undefined,
): client is ProductionModuleClient {
  const candidate = client as Partial<ProductionModuleClient> | undefined;
  return (
    typeof candidate?.open === 'function' &&
    typeof candidate.readBlocks === 'function' &&
    typeof candidate.saveProgress === 'function' &&
    typeof candidate.load === 'function' &&
    typeof candidate.save === 'function' &&
    typeof candidate.newGame === 'function'
  );
}

export interface MoyuApp {
  readonly router: Router;
  readonly isBossMode: boolean;
  navigate(section: AppSection): boolean;
  captureModuleSnapshot(): ModuleSnapshot;
  setBossMode(mode: BossMode, template: BossTemplate): void;
  dispose(): void;
}

export function createApp(
  root: HTMLElement,
  settingsClient?: SettingsClient,
  initialSection: AppSection = 'books',
  resolveModule?: (route: AppSection) => ModuleBinding | undefined,
): MoyuApp {
  const document = root.ownerDocument;
  const normalRegion = document.createElement('div');
  normalRegion.setAttribute('role', 'main');
  normalRegion.setAttribute('aria-label', 'Moyu content');
  normalRegion.setAttribute('data-normal-region', 'true');
  root.replaceChildren(normalRegion);

  const router = new Router((section) => {
    const heading = document.createElement('h1');
    heading.textContent = `Moyu 路 ${section}`;
    normalRegion.replaceChildren(heading);
  });
  const moduleClient = isProductionModuleClient(settingsClient)
    ? settingsClient
    : undefined;
  const readerController =
    moduleClient === undefined ? undefined : new ReaderController(moduleClient);
  const gameController =
    moduleClient === undefined
      ? undefined
      : new Game2048Controller(moduleClient);
  const shellController = {};
  const shellModule: ModuleBinding = {
    id: 'shell',
    controller: shellController,
    pause: () => normalRegion.setAttribute('data-paused', 'true'),
    resume: () => normalRegion.removeAttribute('data-paused'),
    captureAnchor: () => normalRegion.scrollTop,
    restoreAnchor: (anchor) => {
      if (typeof anchor === 'number') normalRegion.scrollTop = anchor;
    },
    captureState: () => shellController,
  };
  const homeClient =
    typeof settingsClient?.readHome === 'function'
      ? { readHome: settingsClient.readHome.bind(settingsClient) }
      : undefined;
  const homeController =
    homeClient === undefined
      ? undefined
      : new HomeController(homeClient, (action: HomeAction) => {
          if (action.type === 'navigate') {
            router.navigate(action.section);
            return;
          }
          router.navigate('reader');
          void readerController?.open(action.bookId);
        });
  const booksClient =
    typeof settingsClient?.readBooks === 'function'
      ? (settingsClient as SettingsClient & BookshelfClient)
      : undefined;
  const bookshelfController =
    booksClient === undefined
      ? undefined
      : new BookshelfController(booksClient, undefined, (bookId) => {
          router.navigate('reader');
          void readerController?.open(bookId);
        });
  const homeModule: ModuleBinding | undefined = homeController && {
    id: 'home',
    controller: homeController,
    pause: () => normalRegion.setAttribute('data-paused', 'true'),
    resume: () => normalRegion.removeAttribute('data-paused'),
    captureAnchor: () => normalRegion.scrollTop,
    restoreAnchor: (anchor) => {
      if (typeof anchor === 'number') normalRegion.scrollTop = anchor;
    },
    captureState: () => homeController,
  };
  const booksModule: ModuleBinding | undefined = bookshelfController && {
    id: 'books',
    controller: bookshelfController,
    pause: () => undefined,
    resume: () => undefined,
    captureAnchor: () => normalRegion.scrollTop,
    restoreAnchor: (anchor) => {
      if (typeof anchor === 'number') normalRegion.scrollTop = anchor;
    },
    captureState: () => bookshelfController,
  };
  const readerModule: ModuleBinding | undefined = readerController && {
    id: 'reader',
    controller: readerController,
    pause: () => readerController.pause(),
    resume: () => readerController.resume(),
    captureFocus: () => readerController.captureFocus(),
    restoreFocus: (token) => {
      if (token !== undefined) readerController.restoreFocus(token as never);
    },
    captureAnchor: () => readerController.captureLogicalAnchor(),
    restoreAnchor: (anchor) => {
      if (anchor !== undefined) {
        readerController.restoreLogicalAnchor(anchor as LogicalLocator);
      }
    },
    captureScroll: () => readerController.captureScroll(),
    restoreScroll: (scroll) => readerController.restoreScroll(scroll as number),
    captureState: () => readerController.captureState(),
  };
  const gameModule: ModuleBinding | undefined = gameController && {
    get id() {
      return `game2048:${gameController.captureState().gameSessionId}`;
    },
    controller: gameController,
    pause: () => gameController.pause(),
    resume: () => gameController.resume(),
    captureFocus: () => gameController.captureFocus(),
    restoreFocus: (token) => gameController.restoreFocus(token as string),
    captureAnchor: () => gameController.captureAnchor(),
    restoreAnchor: (anchor) => gameController.restoreAnchor(anchor as string),
    captureState: () => gameController.captureState(),
  };
  const productionModule = (route: AppSection): ModuleBinding | undefined => {
    if (route === 'home') return homeModule ?? shellModule;
    if (route === 'books') return booksModule ?? shellModule;
    if (route === 'reader') return readerModule;
    if (route === 'game2048') return gameModule;
    return shellModule;
  };
  const lifecycle = new ModuleLifecycle(
    router,
    resolveModule ?? productionModule,
  );
  const bossOverlay = new BossOverlay(root, normalRegion);
  let bossSnapshot: ModuleSnapshot | undefined;
  let activeBossTemplate: BossTemplate = DEFAULT_READER_SETTINGS.bossTemplate;
  let settingsVersion = 0;
  const settingsView = new SettingsView(
    normalRegion,
    (patch) => {
      void updateSettings(patch);
    },
    {
      onReset: () => {
        void updateSettings({
          fontSize: DEFAULT_READER_SETTINGS.fontSize,
          lineHeight: DEFAULT_READER_SETTINGS.lineHeight,
          contentWidth: DEFAULT_READER_SETTINGS.contentWidth,
        });
      },
    },
  );

  const renderSettingsSnapshot = (snapshot: ReaderSettingsSnapshot): void => {
    settingsVersion = snapshot.version;
    settingsView.render(snapshot.settings);
  };

  const appendSettingsStatus = (message: string): void => {
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = message;
    normalRegion.append(status);
  };

  const renderSettingsUnavailable = (): void => {
    const heading = document.createElement('h1');
    heading.textContent = 'Reader settings';
    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    status.textContent = 'Reader settings are unavailable.';
    normalRegion.replaceChildren(heading, status);
  };

  const renderModuleUnavailable = (label: string): void => {
    const heading = document.createElement('h1');
    heading.textContent = label;
    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    status.textContent = `${label} is unavailable.`;
    normalRegion.replaceChildren(heading, status);
  };

  const prepareNormalRegion = (): void => {
    // ReaderView owns the shared region class while it is mounted. Clear it
    // before another route so Reader-only layout selectors cannot go stale.
    normalRegion.className = '';
  };

  const unregisterHome = router.register('home', () => {
    prepareNormalRegion();
    if (homeController === undefined) {
      renderModuleUnavailable('Home');
      return;
    }
    homeController.mount(normalRegion);
  });

  const unregisterBooks = router.register('books', () => {
    prepareNormalRegion();
    if (bookshelfController === undefined) {
      renderModuleUnavailable('Books');
      return;
    }
    bookshelfController.mount(normalRegion);
  });

  const loadSettings = async (status?: string): Promise<void> => {
    if (settingsClient === undefined) return;
    try {
      renderSettingsSnapshot(await settingsClient.readSettings());
      if (status !== undefined) appendSettingsStatus(status);
    } catch {
      renderSettingsUnavailable();
    }
  };

  const updateSettings = async (patch: ReaderSettingsPatch): Promise<void> => {
    if (settingsClient === undefined) return;
    try {
      renderSettingsSnapshot(
        await settingsClient.updateSettings(settingsVersion, patch),
      );
    } catch {
      await loadSettings('Settings were not saved.');
    }
  };

  const unregisterSettings = router.register('settings', () => {
    prepareNormalRegion();
    if (settingsClient === undefined) {
      renderSettingsSnapshot({
        version: 0,
        settings: { ...DEFAULT_READER_SETTINGS },
      });
      return;
    }
    void loadSettings();
  });
  const unregisterReader = router.register('reader', () => {
    prepareNormalRegion();
    if (readerController === undefined) {
      renderModuleUnavailable('Reader');
      return;
    }
    readerController.mount(normalRegion, {
      onBack: () => router.navigate('books'),
      onAction: (action: ReaderAction) => {
        if (action === 'settings') router.navigate('settings');
      },
    });
  });
  const unregisterGame = router.register('game2048', () => {
    prepareNormalRegion();
    if (gameController === undefined) {
      renderModuleUnavailable('2048');
      return;
    }
    gameController.mount(normalRegion);
  });

  router.navigate(initialSection);
  return {
    router,
    get isBossMode(): boolean {
      return bossSnapshot !== undefined;
    },
    navigate(section: AppSection): boolean {
      if (bossSnapshot !== undefined) return false;
      router.navigate(section);
      return true;
    },
    captureModuleSnapshot(): ModuleSnapshot {
      return lifecycle.capture();
    },
    setBossMode(mode: BossMode, template: BossTemplate): void {
      if (mode === 'BOSS_MODE') {
        if (bossSnapshot !== undefined) return;
        const snapshot = lifecycle.capture();
        lifecycle.pause();
        try {
          bossOverlay.show(template);
          activeBossTemplate = template;
          bossSnapshot = snapshot;
        } catch (error) {
          lifecycle.resume(snapshot);
          throw error;
        }
        return;
      }
      if (bossSnapshot === undefined) return;
      const snapshot = bossSnapshot;
      bossOverlay.hide();
      try {
        lifecycle.resume(snapshot);
        bossSnapshot = undefined;
      } catch (error) {
        bossOverlay.show(activeBossTemplate);
        throw error;
      }
    },
    dispose(): void {
      if (bossSnapshot !== undefined) {
        bossOverlay.hide();
        lifecycle.resume(bossSnapshot);
        bossSnapshot = undefined;
      }
      unregisterSettings();
      unregisterHome();
      unregisterBooks();
      unregisterReader();
      unregisterGame();
      homeController?.dispose();
      bookshelfController?.dispose();
      readerController?.dispose();
      gameController?.dispose();
      root.replaceChildren();
    },
  };
}
