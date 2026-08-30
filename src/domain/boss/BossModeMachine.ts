import type { BossMode, BossSnapshot, BossTransition } from './types';

export class BossModeMachine {
  private currentMode: BossMode = 'NORMAL';
  private savedSnapshot: BossSnapshot | undefined;

  get mode(): BossMode {
    return this.currentMode;
  }

  get snapshot(): BossSnapshot | undefined {
    return this.savedSnapshot;
  }

  enter(snapshot: BossSnapshot): BossTransition {
    if (this.currentMode === 'BOSS_MODE') {
      return {
        from: 'BOSS_MODE',
        mode: 'BOSS_MODE',
        snapshot: this.savedSnapshot,
      };
    }
    this.savedSnapshot = snapshot;
    this.currentMode = 'BOSS_MODE';
    return { from: 'NORMAL', mode: 'BOSS_MODE', snapshot };
  }

  exit(): BossTransition {
    if (this.currentMode === 'NORMAL') {
      return { from: 'NORMAL', mode: 'NORMAL' };
    }
    const restoredSnapshot = this.savedSnapshot;
    this.savedSnapshot = undefined;
    this.currentMode = 'NORMAL';
    return { from: 'BOSS_MODE', mode: 'NORMAL', restoredSnapshot };
  }

  toggle(snapshotProvider: () => BossSnapshot): BossTransition {
    return this.currentMode === 'NORMAL'
      ? this.enter(snapshotProvider())
      : this.exit();
  }

  restore(mode: BossMode, snapshot?: BossSnapshot): void {
    this.currentMode = mode;
    this.savedSnapshot = mode === 'BOSS_MODE' ? snapshot : undefined;
  }
}
