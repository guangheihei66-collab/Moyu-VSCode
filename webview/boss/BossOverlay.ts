import type { BossTemplate } from '../../src/domain/reader/settings';
import { BOSS_PANEL_TITLES, BOSS_TEMPLATES } from './templates';

export class BossOverlay {
  private readonly overlay: HTMLElement;
  private readonly title: HTMLElement;
  private readonly content: HTMLElement;
  private focusBeforeShow: HTMLElement | null = null;

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
    this.overlay.setAttribute('aria-label', 'Work document preview');

    const header = document.createElement('header');
    this.title = document.createElement('h1');
    this.title.setAttribute('data-boss-document-title', 'true');
    header.append(this.title);
    this.content = document.createElement('pre');
    this.content.setAttribute('aria-label', 'Document contents');
    this.content.setAttribute('data-boss-document-content', 'true');
    this.overlay.append(header, this.content);
    host.append(this.overlay);
  }

  show(template: BossTemplate): void {
    if (this.overlay.hidden) {
      const activeElement = this.overlay.ownerDocument.activeElement;
      this.focusBeforeShow = hasFocusMethod(activeElement)
        ? (activeElement as HTMLElement)
        : null;
    }
    this.title.textContent = BOSS_PANEL_TITLES[template];
    this.content.textContent = BOSS_TEMPLATES[template];
    this.normalRegion.inert = true;
    this.normalRegion.hidden = true;
    this.normalRegion.setAttribute('aria-hidden', 'true');
    this.overlay.hidden = false;
    this.overlay.focus({ preventScroll: true });
  }

  hide(): void {
    const focusTarget = this.focusBeforeShow;
    this.focusBeforeShow = null;
    this.overlay.hidden = true;
    this.normalRegion.hidden = false;
    this.normalRegion.inert = false;
    this.normalRegion.removeAttribute('aria-hidden');
    focusTarget?.focus({ preventScroll: true });
  }
}

function hasFocusMethod(value: Element | null): boolean {
  return (
    value !== null &&
    typeof (value as Partial<HTMLElement>).focus === 'function'
  );
}
