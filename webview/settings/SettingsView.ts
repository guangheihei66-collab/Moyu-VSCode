import type {
  BossTemplate,
  ReaderSettings,
  ReaderSettingsPatch,
} from '../../src/domain/reader/settings';
export class SettingsView {
  constructor(
    private readonly root: HTMLElement,
    private readonly update: (patch: ReaderSettingsPatch) => void = () =>
      undefined,
  ) {}
  render(settings: ReaderSettings): void {
    const document = this.root.ownerDocument;
    applyReaderSettings(document, settings);
    const heading = document.createElement('h1');
    heading.textContent = 'Reader settings';
    const form = document.createElement('section');
    form.setAttribute('aria-label', 'Reader settings');
    form.append(
      this.range(
        'Font size',
        'font-size',
        12,
        32,
        1,
        settings.fontSize,
        (fontSize) => ({ fontSize }),
      ),
      this.range(
        'Line height',
        'line-height',
        1.2,
        2.2,
        0.1,
        settings.lineHeight,
        (lineHeight) => ({ lineHeight }),
      ),
      this.range(
        'Content width',
        'content-width',
        480,
        1200,
        20,
        settings.contentWidth,
        (contentWidth) => ({ contentWidth }),
      ),
      this.template(settings.bossTemplate),
    );
    this.root.replaceChildren(heading, form);
  }
  private range(
    labelText: string,
    id: string,
    min: number,
    max: number,
    step: number,
    value: number,
    patch: (value: number) => ReaderSettingsPatch,
  ): HTMLElement {
    const document = this.root.ownerDocument;
    const field = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = labelText;
    label.setAttribute('for', id);
    const input = document.createElement('input');
    input.id = id;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () =>
      this.update(patch(Number(input.value))),
    );
    field.append(label, input);
    return field;
  }
  private template(value: BossTemplate): HTMLElement {
    const document = this.root.ownerDocument;
    const field = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Boss template';
    label.setAttribute('for', 'boss-template');
    const select = document.createElement('select');
    select.id = 'boss-template';
    for (const template of ['typescript', 'json', 'buildLog'] as const) {
      const option = document.createElement('option');
      option.value = template;
      option.textContent = template;
      option.selected = template === value;
      select.append(option);
    }
    select.addEventListener('change', () =>
      this.update({ bossTemplate: select.value as BossTemplate }),
    );
    field.append(label, select);
    return field;
  }
}
export function applyReaderSettings(
  document: Document,
  settings: ReaderSettings,
): void {
  document.documentElement.style.setProperty(
    '--moyu-font-size',
    `${settings.fontSize}px`,
  );
  document.documentElement.style.setProperty(
    '--moyu-line-height',
    String(settings.lineHeight),
  );
  document.documentElement.style.setProperty(
    '--moyu-content-width',
    `${settings.contentWidth}px`,
  );
}
