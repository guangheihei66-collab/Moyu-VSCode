export type BossMode = 'NORMAL' | 'BOSS_MODE';

export type BossTemplate = 'typescript' | 'json' | 'buildLog';

export interface BossSnapshot {
  route: string;
  moduleId: string;
  logicalFocus?: string;
  scrollAnchor?: string;
  moduleState?: unknown;
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
  requestBossTransition?: (transition: BossTransition) => Promise<void>;
  setPanelTitle?: (title: string) => void | Promise<void>;
  setBossContext?: (enabled: boolean) => void | Promise<void>;
}
