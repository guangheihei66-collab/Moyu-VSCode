import { createButton, type ButtonOptions } from './Button';
import { createText } from './dom';

export interface EmptyStateOptions {
  title: string;
  description: string;
  action?: ButtonOptions;
}

export function createEmptyState(
  document: Document,
  options: EmptyStateOptions,
): HTMLElement {
  const empty = document.createElement('section');
  empty.className = 'moyu-empty-state';
  empty.setAttribute('aria-live', 'polite');
  empty.append(
    createText(document, 'h2', options.title),
    createText(document, 'p', options.description),
  );
  if (options.action !== undefined) {
    empty.append(createButton(document, options.action));
  }
  return empty;
}
