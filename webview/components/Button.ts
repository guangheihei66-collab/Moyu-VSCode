import { createIcon, type IconName } from './Icon';
import { createText } from './dom';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonOptions {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
}

export function createButton(
  document: Document,
  options: ButtonOptions,
): HTMLButtonElement {
  const button = document.createElement('button');
  const variant = options.variant ?? 'secondary';
  button.type = options.type ?? 'button';
  button.className = `moyu-button moyu-button--${variant}`;
  button.disabled = options.disabled ?? false;
  button.setAttribute('type', button.type);
  if (options.pressed !== undefined) {
    button.setAttribute('aria-pressed', String(options.pressed));
  }
  if (options.title !== undefined) button.setAttribute('title', options.title);
  if (options.icon !== undefined)
    button.append(createIcon(document, options.icon));
  button.append(createText(document, 'span', options.label));
  if (options.onClick !== undefined) {
    button.addEventListener('click', () => options.onClick?.());
  }
  return button;
}
