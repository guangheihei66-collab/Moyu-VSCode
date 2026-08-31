import type { AppSection } from '../../src/shared/protocol/messages';
import type { Router } from './router';

export interface ModuleBinding {
  readonly id: string;
  readonly controller: object;
  pause(): void;
  resume(): void;
  captureFocus?(): unknown;
  restoreFocus?(token: unknown): void;
  captureAnchor?(): unknown;
  restoreAnchor?(anchor: unknown): void;
  captureScroll?(): unknown;
  restoreScroll?(scroll: unknown): void;
  captureState?(): unknown;
}

export interface ModuleSnapshot {
  readonly route: AppSection;
  readonly moduleId: string;
  readonly controller: object;
  readonly logicalFocus?: unknown;
  readonly logicalAnchor?: unknown;
  readonly logicalScroll?: unknown;
  readonly moduleState?: unknown;
}

export class ModuleLifecycle {
  constructor(
    private readonly router: Router,
    private readonly resolveModule: (
      route: AppSection,
    ) => ModuleBinding | undefined,
  ) {}

  capture(): ModuleSnapshot {
    const route = this.router.current;
    const module = this.requireModule(route);
    return {
      route,
      moduleId: module.id,
      controller: module.controller,
      logicalFocus: module.captureFocus?.(),
      logicalAnchor: module.captureAnchor?.(),
      logicalScroll: module.captureScroll?.(),
      moduleState: module.captureState?.(),
    };
  }

  pause(): void {
    this.requireModule(this.router.current).pause();
  }

  resume(snapshot: ModuleSnapshot): void {
    const module = this.requireModule(snapshot.route);
    if (
      module.id !== snapshot.moduleId ||
      module.controller !== snapshot.controller
    ) {
      throw new Error('Active module identity changed during Boss Mode.');
    }
    if (this.router.current !== snapshot.route) {
      this.router.navigate(snapshot.route);
    }
    module.resume();
    if (snapshot.logicalScroll !== undefined) {
      module.restoreScroll?.(snapshot.logicalScroll);
    }
    if (snapshot.logicalAnchor !== undefined) {
      module.restoreAnchor?.(snapshot.logicalAnchor);
    }
    if (snapshot.logicalFocus !== undefined) {
      module.restoreFocus?.(snapshot.logicalFocus);
    }
  }

  private requireModule(route: AppSection): ModuleBinding {
    const module = this.resolveModule(route);
    if (module === undefined) {
      throw new Error(`No active module is registered for ${route}.`);
    }
    return module;
  }
}
