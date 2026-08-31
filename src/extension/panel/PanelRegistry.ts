import type { AppSection } from '../../shared/protocol/messages';
import type { PanelController } from './PanelController';
import type { ContextKeys } from '../contextKeys';

export type PanelFactory = (
  windowId: string,
  onStateChange: (state: {
    visible: boolean;
    open: boolean;
    bossMode?: boolean;
  }) => void,
) => PanelController;

export class PanelRegistry {
  private readonly panels = new Map<string, PanelController>();
  constructor(
    private readonly factory: PanelFactory,
    private readonly contextKeys: ContextKeys,
    private readonly onPanelDisposed: (() => void) | undefined = undefined,
  ) {}
  async openOrReveal(
    windowId: string,
    section: AppSection,
  ): Promise<PanelController> {
    let panel = this.panels.get(windowId);
    if (panel === undefined) {
      panel = this.factory(windowId, (state) => {
        if (state.open) {
          if (!state.visible) this.onPanelDisposed?.();
          this.contextKeys.set({ isOpen: true, isVisible: state.visible });
          if (state.bossMode !== undefined) {
            this.contextKeys.set({ isBossMode: state.bossMode });
          }
        } else {
          this.panels.delete(windowId);
          this.onPanelDisposed?.();
          this.contextKeys.clear();
        }
      });
      this.panels.set(windowId, panel);
      this.contextKeys.set({
        isOpen: true,
        isVisible: true,
        isBossMode: false,
      });
    }
    panel.open(section);
    return panel;
  }
  get(windowId: string): PanelController | undefined {
    return this.panels.get(windowId);
  }
  restore(
    windowId: string,
    panel: Parameters<PanelController['restore']>[0],
    section: AppSection = 'books',
  ): PanelController {
    let controller = this.panels.get(windowId);
    if (controller === undefined) {
      controller = this.factory(windowId, (state) => {
        if (state.open) {
          this.contextKeys.set({
            isOpen: true,
            isVisible: state.visible,
            isBossMode: state.bossMode ?? false,
          });
        } else {
          this.panels.delete(windowId);
          this.onPanelDisposed?.();
          this.contextKeys.clear();
        }
      });
      this.panels.set(windowId, controller);
    }
    controller.restore(panel, section);
    return controller;
  }
  remove(windowId: string): void {
    this.panels.delete(windowId);
    this.onPanelDisposed?.();
    if (this.panels.size === 0) this.contextKeys.clear();
  }
}
