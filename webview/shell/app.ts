import {
  DEFAULT_READER_SETTINGS,
  type ReaderSettingsPatch,
  type ReaderSettingsSnapshot,
} from '../../src/domain/reader/settings';
import type { AppSection } from '../../src/shared/protocol/messages';
import { SettingsView } from '../settings/SettingsView';
import { Router } from './router';

export interface SettingsClient {
  readSettings(): Promise<ReaderSettingsSnapshot>;
  updateSettings(
    baseVersion: number,
    patch: ReaderSettingsPatch,
  ): Promise<ReaderSettingsSnapshot>;
}

export function createApp(
  root: HTMLElement,
  settingsClient?: SettingsClient,
  initialSection: AppSection = 'books',
): {
  router: Router;
  dispose: () => void;
} {
  const document = root.ownerDocument;
  const router = new Router((section) => {
    const heading = document.createElement('h1');
    heading.textContent = `Moyu · ${section}`;
    root.replaceChildren(heading);
  });
  let settingsVersion = 0;
  const settingsView = new SettingsView(root, (patch) => {
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
    root.append(status);
  };

  const renderSettingsUnavailable = (): void => {
    const heading = document.createElement('h1');
    heading.textContent = 'Reader settings';
    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    status.textContent = 'Reader settings are unavailable.';
    root.replaceChildren(heading, status);
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

  router.navigate(initialSection);
  return {
    router,
    dispose: () => {
      unregisterSettings();
      root.replaceChildren();
    },
  };
}
