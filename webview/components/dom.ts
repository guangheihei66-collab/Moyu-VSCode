export function createText(
  document: Document,
  tag: string,
  text: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

export function setAttributes(
  element: HTMLElement,
  attributes: Readonly<Record<string, string | undefined>>,
): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) element.setAttribute(name, value);
  }
}
