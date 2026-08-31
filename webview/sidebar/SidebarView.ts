import {
  type SidebarMessage,
  type SidebarSection,
  type SidebarViewModel,
} from '../../src/shared/protocol/messages';
import { createButton } from '../components/Button';
import type { IconName } from '../components/Icon';
import { createText } from '../components/dom';

interface SidebarEntry {
  section: SidebarSection;
  label: string;
  icon: IconName;
  summary: (model: SidebarViewModel) => string;
}

const ENTRIES: readonly SidebarEntry[] = [
  { section: 'home', label: 'Home', icon: 'home', summary: () => 'Overview' },
  {
    section: 'books',
    label: 'Books',
    icon: 'books',
    summary: (model) => `${model.booksCount} books`,
  },
  {
    section: 'game2048',
    label: '2048',
    icon: 'game2048',
    summary: (model) => `Best ${model.bestScore}`,
  },
  {
    section: 'settings',
    label: 'Settings',
    icon: 'settings',
    summary: () => 'Preferences',
  },
];

export class SidebarView {
  private readonly document: Document;
  private readonly root: HTMLElement;
  private readonly onNavigate: (message: SidebarMessage) => void;
  private readonly buttons = new Map<SidebarSection, HTMLButtonElement>();
  private active: SidebarSection = 'home';

  constructor(
    root: HTMLElement,
    onNavigate: (message: SidebarMessage) => void,
  ) {
    this.root = root;
    this.document = root.ownerDocument;
    this.onNavigate = onNavigate;
  }

  render(model: SidebarViewModel): void {
    this.active = model.active;
    this.buttons.clear();
    const nav = this.document.createElement('nav');
    nav.className = 'moyu-sidebar';
    nav.setAttribute('aria-label', 'Moyu navigation');
    nav.append(createText(this.document, 'h1', 'Moyu'));

    const list = this.document.createElement('div');
    list.className = 'moyu-sidebar__list';
    for (const entry of ENTRIES) {
      const button = createButton(this.document, {
        label: entry.label,
        icon: entry.icon,
        variant: 'quiet',
        onClick: () =>
          this.onNavigate({ type: 'navigate', section: entry.section }),
      });
      button.className = 'moyu-sidebar__entry';
      button.setAttribute('data-sidebar-section', entry.section);
      const summary = createText(this.document, 'span', entry.summary(model));
      summary.className = 'moyu-sidebar__summary';
      button.append(summary);
      if (entry.section === model.active) {
        button.setAttribute('aria-current', 'page');
        button.setAttribute('data-selected', 'true');
      }
      this.buttons.set(entry.section, button);
      list.append(button);
    }
    nav.append(list);
    this.root.replaceChildren(nav);
  }

  focusActive(): void {
    this.buttons.get(this.active)?.focus();
  }
}
