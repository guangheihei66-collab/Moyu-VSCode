import type { AppSection } from '../../shared/protocol/messages';
import type { PanelController } from './PanelController';
import type { ContextKeys } from '../contextKeys';

export type PanelFactory = (
  windowId: string,
  onStateChange: (state: { visible: boolean; open: boolean }) => void,
) => PanelController;

export class PanelRegistry {
  private readonly panels = new Map<string, PanelController>();
  constructor(
    private readonly factory: PanelFactory,
    private readonly contextKeys: ContextKeys,
  ) {}
  async openOrReveal(
    windowId: string,
    section: AppSection,
  ): Promise<PanelController> {
    let panel = this.panels.get(windowId);
    if (panel === undefined) {
      panel = this.factory(windowId, (state) => {
        if (state.open)
          this.contextKeys.set({ isOpen: true, isVisible: state.visible });
        else {
          this.panels.delete(windowId);
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
  remove(windowId: string): void {
    this.panels.delete(windowId);
    if (this.panels.size === 0) this.contextKeys.clear();
  }
}
