import { createButton, type ButtonOptions } from './Button';
import { createText } from './dom';

export interface SectionHeaderOptions {
  title: string;
  description?: string;
  action?: ButtonOptions;
}

export function createSectionHeader(
  document: Document,
  options: SectionHeaderOptions,
): HTMLElement {
  const header = document.createElement('header');
  header.className = 'moyu-section-header';
  const copy = document.createElement('div');
  copy.className = 'moyu-section-header__copy';
  copy.append(createText(document, 'h1', options.title));
  if (options.description !== undefined) {
    copy.append(createText(document, 'p', options.description));
  }
  header.append(copy);
  if (options.action !== undefined) {
    header.append(createButton(document, options.action));
  }
  return header;
}
