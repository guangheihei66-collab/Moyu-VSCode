import type { BossTemplate } from '../../src/domain/reader/settings';
import { BOSS_TEMPLATES } from './templates';

export class BossOverlay {
  private readonly overlay: HTMLElement;
  private readonly content: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly normalRegion: HTMLElement,
  ) {
    const document = host.ownerDocument;
    this.overlay = document.createElement('section');
    this.overlay.setAttribute('data-boss-overlay', 'true');
    this.overlay.hidden = true;
    this.overlay.tabIndex = -1;
    this.overlay.setAttribute('role', 'document');
    this.overlay.setAttribute('aria-label', 'Boss mode work preview');

    this.content = document.createElement('pre');
    this.content.setAttribute('aria-label', 'Local static work preview');
    this.overlay.append(this.content);
    host.append(this.overlay);
  }

  show(template: BossTemplate): void {
    this.content.textContent = BOSS_TEMPLATES[template];
    this.normalRegion.inert = true;
    this.normalRegion.hidden = true;
    this.normalRegion.setAttribute('aria-hidden', 'true');
    this.overlay.hidden = false;
    this.overlay.focus({ preventScroll: true });
  }

  hide(): void {
    this.overlay.hidden = true;
    this.normalRegion.hidden = false;
    this.normalRegion.inert = false;
    this.normalRegion.removeAttribute('aria-hidden');
  }
}
