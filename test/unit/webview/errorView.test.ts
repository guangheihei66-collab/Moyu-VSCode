import { describe, expect, it, vi } from 'vitest';

import { MoyuError } from '../../../src/domain/shared/errors';
import { ErrorView } from '../../../webview/shell/ErrorView';

class TestElement {
  readonly children: TestElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, () => void>();
  textContent = '';
  type = '';

  constructor(readonly tagName: string) {}

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  querySelector(selector: string): TestElement | null {
    const match = /^\[data-recovery-action="([^"]+)"\]$/.exec(selector);
    if (match?.[1] !== undefined) {
      return this.find(
        (element) => element.dataset.recoveryAction === match[1],
      );
    }
    return null;
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((child) => child.fullText).join('')
    );
  }

  private find(
    predicate: (element: TestElement) => boolean,
  ): TestElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested !== null) return nested;
    }
    return null;
  }
}

class TestDocument {
  createElement(tagName: string): TestElement {
    return new TestElement(tagName.toUpperCase());
  }
}

describe('ErrorView', () => {
  it('renders safe accessible recovery UI and dispatches a bounded action', () => {
    const document = new TestDocument();
    const root = document.createElement('main');
    const onAction = vi.fn();
    const view = new ErrorView(root as unknown as HTMLElement, onAction);

    view.show(new MoyuError('STATE_CORRUPT', 'C:\\private\\state.json'));

    expect(root.attributes.get('role')).toBe('alert');
    expect(root.fullText).toContain('invalid saved data');
    expect(root.fullText).not.toContain('C:\\private');
    const retry = root.querySelector('[data-recovery-action="retry"]');
    expect(retry).not.toBeNull();
    retry?.listeners.get('click')?.();
    expect(onAction).toHaveBeenCalledWith('retry');

    view.clear();
    expect(root.children).toHaveLength(0);
  });
});
