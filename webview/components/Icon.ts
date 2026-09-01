import { createText } from './dom';

export type IconName =
  | 'home'
  | 'books'
  | 'settings'
  | 'more'
  | 'close'
  | 'back'
  | 'forward'
  | 'check';

const GLYPHS: Readonly<Record<IconName, string>> = {
  home: '⌂',
  books: '▤',
  settings: '⚙',
  more: '⋯',
  close: '×',
  back: '‹',
  forward: '›',
  check: '✓',
};

export function createIcon(document: Document, name: IconName): HTMLElement {
  const icon = createText(document, 'span', GLYPHS[name]);
  icon.className = 'moyu-icon';
  icon.setAttribute('data-icon', name);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}
