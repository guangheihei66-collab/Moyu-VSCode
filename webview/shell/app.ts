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
    if (settingsClient !== undefined)
      void settingsClient
        .updateSettings(settingsVersion, patch)
        .then(renderSettingsSnapshot);
  });
  const renderSettingsSnapshot = (snapshot: ReaderSettingsSnapshot): void => {
    settingsVersion = snapshot.version;
    settingsView.render(snapshot.settings);
  };
  const unregisterSettings = router.register('settings', () => {
    if (settingsClient === undefined) {
      renderSettingsSnapshot({
        version: 0,
        settings: { ...DEFAULT_READER_SETTINGS },
      });
      return;
    }
    void settingsClient.readSettings().then(renderSettingsSnapshot);
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
