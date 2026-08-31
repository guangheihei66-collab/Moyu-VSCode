import {
  DEFAULT_READER_SETTINGS,
  type BossTemplate,
  type ReaderSettings,
  type ReaderSettingsPatch,
} from '../../src/domain/reader/settings';
import { BOSS_PANEL_TITLES, BOSS_TEMPLATES } from '../boss/templates';
import { createButton } from '../components/Button';
import { createText } from '../components/dom';

export interface SettingsViewCallbacks {
  onReset?: () => void;
  onPreview?: (template: BossTemplate) => void;
}

const TEMPLATE_LABELS: Readonly<Record<BossTemplate, string>> = Object.freeze({
  typescript: 'TypeScript',
  json: 'JSON',
  buildLog: 'Build Log',
});

const READING_DEFAULTS: ReaderSettingsPatch = {
  fontSize: DEFAULT_READER_SETTINGS.fontSize,
  lineHeight: DEFAULT_READER_SETTINGS.lineHeight,
  contentWidth: DEFAULT_READER_SETTINGS.contentWidth,
};

export class SettingsView {
  private previewSettings: ReaderSettings = {
    ...DEFAULT_READER_SETTINGS,
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly update: (patch: ReaderSettingsPatch) => void = () =>
      undefined,
    private readonly callbacks: SettingsViewCallbacks = {},
  ) {}

  render(settings: ReaderSettings): void {
    const document = this.root.ownerDocument;
    this.previewSettings = { ...settings };
    applyReaderSettings(document, this.previewSettings);

    const page = document.createElement('main');
    page.className = 'moyu-settings';
    const heading = createText(document, 'h1', 'Reader settings');
    page.append(heading);

    const form = document.createElement('form');
    form.className = 'moyu-settings__form';
    form.setAttribute('aria-label', 'Reader settings');
    form.append(this.readingSection(settings), this.bossSection(settings));
    page.append(form);
    this.root.replaceChildren(page);
  }

  private readingSection(settings: ReaderSettings): HTMLElement {
    const document = this.root.ownerDocument;
    const section = document.createElement('section');
    section.className = 'moyu-settings__section';
    section.setAttribute('aria-labelledby', 'reading-settings-heading');
    section.append(
      this.sectionHeading(
        'reading-settings-heading',
        'Reading',
        'Adjust the text layout for comfortable reading.',
      ),
      this.range(
        'Font size',
        'Reader text size.',
        'font-size',
        12,
        32,
        1,
        settings.fontSize,
        (fontSize) => ({ fontSize }),
        (fontSize) => `${fontSize} px`,
      ),
      this.range(
        'Line height',
        'Space between lines.',
        'line-height',
        1.2,
        2.2,
        0.05,
        settings.lineHeight,
        (lineHeight) => ({ lineHeight }),
        (lineHeight) => String(lineHeight),
      ),
      this.range(
        'Content width',
        'Maximum reader width.',
        'content-width',
        480,
        1200,
        20,
        settings.contentWidth,
        (contentWidth) => ({ contentWidth }),
        (contentWidth) => `${contentWidth} px`,
      ),
    );
    return section;
  }

  private bossSection(settings: ReaderSettings): HTMLElement {
    const document = this.root.ownerDocument;
    const section = document.createElement('section');
    section.className = 'moyu-settings__section';
    section.setAttribute('aria-labelledby', 'boss-settings-heading');
    section.append(
      this.sectionHeading(
        'boss-settings-heading',
        'Boss Mode',
        'Choose the local document preview used by Boss Mode.',
      ),
      this.template(settings.bossTemplate),
      this.resetButton(),
    );
    return section;
  }

  private sectionHeading(
    id: string,
    title: string,
    description: string,
  ): HTMLElement {
    const document = this.root.ownerDocument;
    const heading = document.createElement('header');
    heading.className = 'moyu-settings__section-heading';
    const titleElement = createText(document, 'h2', title);
    titleElement.id = id;
    heading.append(titleElement, createText(document, 'p', description));
    return heading;
  }

  private range(
    labelText: string,
    descriptionText: string,
    id: string,
    min: number,
    max: number,
    step: number,
    value: number,
    patch: (value: number) => ReaderSettingsPatch,
    formatValue: (value: number) => string,
  ): HTMLElement {
    const document = this.root.ownerDocument;
    const field = document.createElement('div');
    field.className = 'moyu-settings__field';
    const label = document.createElement('label');
    label.className = 'moyu-settings__label';
    label.setAttribute('for', id);
    label.append(createText(document, 'span', labelText));
    const output = document.createElement('output');
    output.id = `${id}-value`;
    output.className = 'moyu-settings__value';
    output.setAttribute('aria-live', 'polite');
    output.textContent = formatValue(value);
    label.append(output);

    const description = createText(document, 'p', descriptionText);
    description.id = `${id}-description`;
    description.className = 'moyu-settings__description';

    const input = document.createElement('input');
    input.id = id;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-describedby', description.id);

    const syncPreview = (): number | undefined => {
      const next = Number(input.value);
      if (!Number.isFinite(next)) return undefined;
      output.textContent = formatValue(next);
      this.previewSettings = {
        ...this.previewSettings,
        ...patch(next),
      };
      applyReaderSettings(document, this.previewSettings);
      return next;
    };
    input.addEventListener('input', syncPreview);
    input.addEventListener('change', () => {
      const next = syncPreview();
      if (next !== undefined) this.update(patch(next));
    });
    field.append(label, description, input);
    return field;
  }

  private template(value: BossTemplate): HTMLElement {
    const document = this.root.ownerDocument;
    const field = document.createElement('div');
    field.className = 'moyu-settings__field';
    const label = document.createElement('label');
    label.className = 'moyu-settings__label';
    label.textContent = 'Template';
    label.setAttribute('for', 'boss-template');
    const description = createText(
      document,
      'p',
      'Select a static local document preview.',
    );
    description.id = 'boss-template-description';
    description.className = 'moyu-settings__description';
    const select = document.createElement('select');
    select.id = 'boss-template';
    select.value = value;
    select.setAttribute('aria-describedby', description.id);
    for (const template of ['typescript', 'json', 'buildLog'] as const) {
      const option = document.createElement('option');
      option.value = template;
      option.textContent = TEMPLATE_LABELS[template];
      option.selected = template === value;
      select.append(option);
    }

    const preview = document.createElement('div');
    preview.className = 'moyu-settings__preview';
    const previewTitle = createText(document, 'h3', '');
    previewTitle.id = 'boss-template-preview-title';
    const previewCode = document.createElement('pre');
    previewCode.id = 'boss-template-preview';
    previewCode.setAttribute('aria-label', 'Template preview');
    preview.append(previewTitle, previewCode);

    const renderPreview = (template: BossTemplate, notify = false): void => {
      previewTitle.textContent = BOSS_PANEL_TITLES[template];
      previewCode.textContent = BOSS_TEMPLATES[template];
      previewCode.setAttribute('data-template-id', template);
      if (notify) this.callbacks.onPreview?.(template);
    };
    select.addEventListener('change', () => {
      const template = select.value;
      if (!isBossTemplate(template)) return;
      renderPreview(template, true);
      this.update({ bossTemplate: template });
    });
    renderPreview(value);
    field.append(label, description, select, preview);
    return field;
  }

  private resetButton(): HTMLButtonElement {
    const button = createButton(this.root.ownerDocument, {
      label: 'Reset reading settings',
      onClick: () => {
        if (this.callbacks.onReset !== undefined) {
          this.callbacks.onReset();
          return;
        }
        this.update({ ...READING_DEFAULTS });
      },
    });
    button.id = 'reset-reader-settings';
    button.className += ' moyu-settings__reset';
    return button;
  }
}

function isBossTemplate(value: string): value is BossTemplate {
  return value === 'typescript' || value === 'json' || value === 'buildLog';
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
