import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_READER_SETTINGS,
  validateSettings,
} from '../../../src/domain/reader/settings';
import { SettingsView } from '../../../webview/settings/SettingsView';
import { createApp } from '../../../webview/shell/app';

type Listener = () => void;

class StyleStub {
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
}

class ElementStub {
  readonly children: ElementStub[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  textContent = '';
  id = '';
  value = '';
  type = '';
  min = '';
  max = '';
  step = '';
  selected = false;
  ownerDocument!: DocumentStub;

  constructor(readonly tagName = 'div') {}

  append(...items: ElementStub[]): void {
    this.children.push(...items);
  }

  replaceChildren(...items: ElementStub[]): void {
    this.children.splice(0, this.children.length, ...items);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  findById(id: string): ElementStub | undefined {
    if (this.id === id) return this;
    for (const child of this.children) {
      const match = child.findById(id);
      if (match !== undefined) return match;
    }
    return undefined;
  }

  findAll(tagName: string): ElementStub[] {
    const matches = this.tagName === tagName ? [this] : [];
    return matches.concat(
      ...this.children.map((child) => child.findAll(tagName)),
    );
  }

  get fullText(): string {
    return (
      this.textContent + this.children.map((item) => item.fullText).join(' ')
    );
  }
}

class DocumentStub {
  readonly documentElement = { style: new StyleStub() };

  createElement(tagName: string): ElementStub {
    const item = new ElementStub(tagName);
    item.ownerDocument = this;
    return item;
  }
}

function createRoot(): ElementStub {
  const root = new ElementStub('main');
  root.ownerDocument = new DocumentStub();
  return root;
}

async function flushPromises(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}

describe('SettingsView', () => {
  it('renders labelled native controls with exact keyboard-operable constraints', () => {
    const root = createRoot();
    new SettingsView(root as unknown as HTMLElement).render(
      DEFAULT_READER_SETTINGS,
    );

    const controls = [
      ['font-size', 'range', '12', '32', '1'],
      ['line-height', 'range', '1.2', '2.2', '0.05'],
      ['content-width', 'range', '480', '1200', '20'],
      ['boss-template', '', '', '', ''],
    ] as const;
    for (const [id, type, min, max, step] of controls) {
      const control = root.findById(id);
      expect(control, `${id} control`).toBeDefined();
      expect(
        root
          .findAll('label')
          .some((label) => label.attributes.get('for') === id),
      ).toBe(true);
      if (type !== '') {
        expect(control).toMatchObject({ type, min, max, step });
      }
    }
    expect(root.findById('boss-template')?.tagName).toBe('select');
    expect(
      root.findById('boss-template')?.children.map((option) => option.value),
    ).toEqual(['typescript', 'json', 'buildLog']);

    const lineHeight = root.findById('line-height')!;
    const stepOffset =
      (Number(lineHeight.value) - Number(lineHeight.min)) /
      Number(lineHeight.step);
    expect(lineHeight.value).toBe('1.75');
    expect(Number(stepOffset.toFixed(10))).toBe(
      Math.round(Number(stepOffset.toFixed(10))),
    );
    expect(validateSettings({ lineHeight: Number(lineHeight.value) }).ok).toBe(
      true,
    );
  });

  it('emits typed setting patches from native change events', () => {
    const root = createRoot();
    const update = vi.fn();
    new SettingsView(root as unknown as HTMLElement, update).render(
      DEFAULT_READER_SETTINGS,
    );

    const fontSize = root.findById('font-size')!;
    fontSize.value = '22';
    fontSize.dispatch('change');
    const template = root.findById('boss-template')!;
    template.value = 'buildLog';
    template.dispatch('change');

    expect(update.mock.calls).toEqual([
      [{ fontSize: 22 }],
      [{ bossTemplate: 'buildLog' }],
    ]);
  });

  it('applies all reader CSS properties from the rendered snapshot', () => {
    const root = createRoot();
    new SettingsView(root as unknown as HTMLElement).render({
      fontSize: 20,
      lineHeight: 1.9,
      contentWidth: 880,
      bossTemplate: 'json',
    });

    expect(root.ownerDocument.documentElement.style.properties).toEqual(
      new Map([
        ['--moyu-font-size', '20px'],
        ['--moyu-line-height', '1.9'],
        ['--moyu-content-width', '880px'],
      ]),
    );
  });

  it('routes Settings through read and update snapshots with the current base version', async () => {
    const root = createRoot();
    const client = {
      readSettings: vi.fn().mockResolvedValue({
        version: 7,
        settings: DEFAULT_READER_SETTINGS,
      }),
      updateSettings: vi.fn().mockResolvedValue({
        version: 8,
        settings: { ...DEFAULT_READER_SETTINGS, fontSize: 22 },
      }),
    };
    const app = createApp(root as unknown as HTMLElement, client);

    app.router.navigate('settings');
    await flushPromises();
    expect(client.readSettings).toHaveBeenCalledOnce();
    expect(root.fullText).toContain('Reader settings');

    const fontSize = root.findById('font-size')!;
    fontSize.value = '22';
    fontSize.dispatch('change');
    await flushPromises();
    expect(client.updateSettings).toHaveBeenCalledWith(7, { fontSize: 22 });
    expect(
      root.ownerDocument.documentElement.style.properties.get(
        '--moyu-font-size',
      ),
    ).toBe('22px');
  });

  it('renders a safe local state when the initial settings read rejects', async () => {
    const root = createRoot();
    const client = {
      readSettings: vi
        .fn()
        .mockRejectedValue(new Error('C:\\private\\settings.json: denied')),
      updateSettings: vi.fn(),
    };
    const app = createApp(root as unknown as HTMLElement, client as never);

    app.router.navigate('settings');
    await flushPromises();

    expect(root.fullText).toContain('Reader settings are unavailable.');
    expect(root.fullText).not.toMatch(/private|settings\.json|denied/i);
  });

  it('recovers the durable snapshot and exposes a safe status when update rejects', async () => {
    const root = createRoot();
    const client = {
      readSettings: vi
        .fn()
        .mockResolvedValueOnce({
          version: 7,
          settings: DEFAULT_READER_SETTINGS,
        })
        .mockResolvedValueOnce({
          version: 8,
          settings: { ...DEFAULT_READER_SETTINGS, fontSize: 18 },
        }),
      updateSettings: vi
        .fn()
        .mockRejectedValue(new Error('C:\\private\\settings.json: denied')),
    };
    const app = createApp(root as unknown as HTMLElement, client);
    app.router.navigate('settings');
    await flushPromises();

    const fontSize = root.findById('font-size')!;
    fontSize.value = '22';
    fontSize.dispatch('change');
    await flushPromises();

    expect(client.readSettings).toHaveBeenCalledTimes(2);
    expect(
      root.ownerDocument.documentElement.style.properties.get(
        '--moyu-font-size',
      ),
    ).toBe('18px');
    expect(root.fullText).toContain('Settings were not saved.');
    expect(root.fullText).not.toMatch(/private|settings\.json|denied/i);
  });
});
