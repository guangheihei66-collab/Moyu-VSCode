import { createText } from './dom';

export interface ProgressOptions {
  value: number;
  label?: string;
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function createProgress(
  document: Document,
  options: ProgressOptions,
): HTMLElement {
  const value = clampPercentage(options.value);
  const progress = document.createElement('div');
  progress.className = 'moyu-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', String(value));
  progress.setAttribute('aria-label', options.label ?? 'Progress');

  const track = document.createElement('div');
  track.className = 'moyu-progress__track';
  const fill = document.createElement('div');
  fill.className = 'moyu-progress__fill';
  fill.setAttribute('data-progress', String(value));
  fill.setAttribute('style', `--moyu-progress: ${value};`);
  track.append(fill);

  const fallback = createText(document, 'span', `${value}%`);
  fallback.className = 'moyu-progress__value';
  progress.append(track, fallback);
  return progress;
}
