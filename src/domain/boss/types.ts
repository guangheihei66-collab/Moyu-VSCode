export type BossMode = 'NORMAL' | 'BOSS_MODE';

export type BossTemplate = 'typescript' | 'json' | 'buildLog';

export const BOSS_PANEL_TITLES: Readonly<Record<BossTemplate, string>> =
  Object.freeze({
    typescript: 'extension.ts',
    json: 'settings.json',
    buildLog: 'build.log',
  });

export interface BossSnapshot {
  route: string;
  moduleId: string;
  logicalFocus?: string;
  scrollAnchor?: string;
  moduleState?: unknown;
  panelTitle?: string;
}

export interface BossTransition {
  from: BossMode;
  mode: BossMode;
  snapshot?: BossSnapshot;
  restoredSnapshot?: BossSnapshot;
}

export interface BossPanelSession {
  readonly isVisible?: boolean;
  readonly visible?: boolean;
  captureSnapshot?: () => BossSnapshot;
  requestBossTransition?: (
    transition: BossTransition,
    template: BossTemplate,
  ) => Promise<void>;
  setPanelTitle?: (title: string) => void | Promise<void>;
  setBossContext?: (enabled: boolean) => void | Promise<void>;
}
