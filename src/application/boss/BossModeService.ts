import { BossModeMachine } from '../../domain/boss/BossModeMachine';
import type {
  BossPanelSession,
  BossSnapshot,
  BossTransition,
  BossMode,
  BossTemplate,
} from '../../domain/boss/types';
import { BOSS_PANEL_TITLES } from '../../domain/boss/types';

export interface BossModeServiceOptions {
  machine?: BossModeMachine;
  acknowledgementTimeoutMs?: number;
  bossTitle?: string;
  normalTitle?: string;
}

export class BossModeAcknowledgementTimeout extends Error {
  constructor() {
    super('The Webview did not acknowledge the Boss Mode transition.');
    this.name = 'BossModeAcknowledgementTimeout';
  }
}

function isVisible(session: BossPanelSession): boolean {
  return session.isVisible ?? session.visible ?? false;
}

export class BossModeService {
  private readonly machine: BossModeMachine;
  private readonly timeoutMs: number;
  private readonly bossTitle: string;
  private readonly normalTitle: string;
  private activeTemplate: BossTemplate = 'typescript';
  private queue: Promise<void> = Promise.resolve();

  constructor(options: BossModeServiceOptions = {}) {
    this.machine = options.machine ?? new BossModeMachine();
    this.timeoutMs = options.acknowledgementTimeoutMs ?? 2_000;
    this.bossTitle = options.bossTitle ?? 'extension.ts';
    this.normalTitle = options.normalTitle ?? 'Moyu';
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new TypeError(
        'Boss Mode acknowledgement timeout must be positive.',
      );
    }
  }

  get mode(): BossMode {
    return this.machine.mode;
  }

  toggle(
    panelSession?: BossPanelSession | null,
    template: BossTemplate = 'typescript',
  ): Promise<void> {
    const operation = this.queue.then(() =>
      this.performToggle(panelSession, template),
    );
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  reset(): void {
    this.machine.restore('NORMAL');
    this.activeTemplate = 'typescript';
  }

  private async performToggle(
    panelSession?: BossPanelSession | null,
    requestedTemplate: BossTemplate = 'typescript',
  ): Promise<void> {
    if (
      panelSession === undefined ||
      panelSession === null ||
      !isVisible(panelSession)
    ) {
      return;
    }
    const previousMode = this.machine.mode;
    const previousSnapshot = this.machine.snapshot;
    const previousTemplate = this.activeTemplate;
    const transitionTemplate =
      previousMode === 'NORMAL' ? requestedTemplate : previousTemplate;
    const transition = this.machine.toggle(() => {
      if (panelSession.captureSnapshot === undefined) {
        throw new Error('A visible panel must provide a Boss Mode snapshot.');
      }
      return panelSession.captureSnapshot();
    });
    try {
      await this.awaitAcknowledgement(
        panelSession,
        transition,
        transitionTemplate,
      );
      await panelSession.setPanelTitle?.(
        transition.mode === 'BOSS_MODE'
          ? this.bossTitle === 'extension.ts'
            ? BOSS_PANEL_TITLES[transitionTemplate]
            : this.bossTitle
          : (transition.restoredSnapshot?.panelTitle ?? this.normalTitle),
      );
      await panelSession.setBossContext?.(transition.mode === 'BOSS_MODE');
      this.activeTemplate =
        transition.mode === 'BOSS_MODE' ? transitionTemplate : 'typescript';
    } catch (error) {
      this.machine.restore(previousMode, previousSnapshot);
      this.activeTemplate = previousTemplate;
      await this.tryRollback(
        panelSession,
        previousMode,
        previousSnapshot,
        previousTemplate,
      );
      throw error;
    }
  }

  private async awaitAcknowledgement(
    panelSession: BossPanelSession,
    transition: BossTransition,
    template: BossTemplate,
  ): Promise<void> {
    if (panelSession.requestBossTransition === undefined) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        panelSession.requestBossTransition(transition, template),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new BossModeAcknowledgementTimeout()),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async tryRollback(
    panelSession: BossPanelSession,
    mode: BossMode,
    snapshot: BossSnapshot | undefined,
    template: BossTemplate,
  ): Promise<void> {
    if (panelSession.requestBossTransition === undefined) return;
    const rollback: BossTransition =
      mode === 'NORMAL'
        ? { from: 'BOSS_MODE', mode: 'NORMAL', restoredSnapshot: snapshot }
        : { from: 'NORMAL', mode: 'BOSS_MODE', snapshot };
    try {
      await this.awaitAcknowledgement(panelSession, rollback, template);
      await panelSession.setPanelTitle?.(
        mode === 'BOSS_MODE'
          ? this.bossTitle === 'extension.ts'
            ? BOSS_PANEL_TITLES[template]
            : this.bossTitle
          : (snapshot?.panelTitle ?? this.normalTitle),
      );
      await panelSession.setBossContext?.(mode === 'BOSS_MODE');
    } catch {
      // The in-memory machine remains at the last stable mode. A later toggle
      // can retry the panel reconciliation when the Webview is responsive.
    }
  }
}
