import type { BossMode } from '../../src/domain/boss/types';
import {
  DEFAULT_READER_SETTINGS,
  type BossTemplate,
  type ReaderSettingsPatch,
  type ReaderSettingsSnapshot,
} from '../../src/domain/reader/settings';
import type { AppSection } from '../../src/shared/protocol/messages';
import { BossOverlay } from '../boss/BossOverlay';
import {
  Game2048Controller,
  type Game2048Transport,
} from '../game2048/Game2048Controller';
import { ReaderController } from '../reader/ReaderController';
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
  normalRegion.setAttribute('data-normal-region', 'true');
  root.replaceChildren(normalRegion);

  const router = new Router((section) => {
    const heading = document.createElement('h1');
    heading.textContent = `Moyu 路 ${section}`;
    normalRegion.replaceChildren(heading);
  });
  const readerController = new ReaderController({
    readBlocks: async () => ({ blocks: [], atStart: true, atEnd: true }),
    saveProgress: async () => undefined,
  });
  const gameTransport: Game2048Transport = {
    load: async () => undefined,
    save: async (version, state) => ({
      version: version + 1,
      data: { state },
    }),
    newGame: async (version) => ({
      version: version + 1,
      data: {
        state: {
          gameSessionId: 'webview',
          board: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
          score: 0,
          bestScore: 0,
          won: false,
          gameOver: false,
          moveSequence: 0,
          startedAt: 0,
          updatedAt: 0,
          stateVersion: 1,
        },
      },
    }),
  };
  const gameController = new Game2048Controller(gameTransport);
  const shellController = {};
  const shellModule: ModuleBinding = {
    get id() {
      return `shell:${router.current}`;
    },
    controller: shellController,
    pause: () => normalRegion.setAttribute('data-paused', 'true'),
    resume: () => normalRegion.removeAttribute('data-paused'),
    captureAnchor: () => normalRegion.scrollTop,
    restoreAnchor: (anchor) => {
      if (typeof anchor === 'number') normalRegion.scrollTop = anchor;
    },
    captureState: () => shellController,
  };
  const readerModule: ModuleBinding = {
    id: 'reader',
    controller: readerController,
    pause: () => readerController.pause(),
    resume: () => readerController.resume(),
    captureFocus: () => readerController.captureFocus(),
    restoreFocus: (token) => {
      if (token !== undefined) readerController.restoreFocus(token as never);
    },
    captureAnchor: () => readerController.captureAnchor(),
    restoreAnchor: (anchor) => {
      if (anchor !== undefined) readerController.restoreFocus(anchor as never);
    },
    captureScroll: () => readerController.captureScroll(),
    restoreScroll: (scroll) => readerController.restoreScroll(scroll as number),
    captureState: () => readerController.captureState(),
  };
  const gameModule: ModuleBinding = {
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
  const settingsView = new SettingsView(normalRegion, (patch) => {
    void updateSettings(patch);
  });

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
    readerController.mount(normalRegion);
  });
  const unregisterGame = router.register('game2048', () => {
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
      unregisterReader();
      unregisterGame();
      root.replaceChildren();
    },
  };
}
