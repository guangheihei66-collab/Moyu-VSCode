import type { BookUri } from './types';

function rawUri(uri: BookUri): string {
  return typeof uri === 'string' ? uri : uri.toString(true);
}

export function normalizeBookUri(
  uri: BookUri,
  platform: string = 'win32',
): string {
  let value = rawUri(uri).replace(/\\/g, '/');
  if (platform === 'win32' && /^[A-Za-z]:\//.test(value))
    value = `file:///${value}`;
  if (!value.includes('://') && value.startsWith('/'))
    value = `file://${value}`;
  if (value.toLowerCase().startsWith('file://')) {
    const separator = value.indexOf('://');
    const prefix = value.slice(0, separator + 3).toLowerCase();
    const rest = value.slice(separator + 3).replace(/\/+/g, '/');
    value = `${prefix}${rest}`;
  }
  return value;
}

export function sameBookUri(
  left: BookUri,
  right: BookUri,
  platform: string = 'win32',
): boolean {
  const a = normalizeBookUri(left, platform);
  const b = normalizeBookUri(right, platform);
  return platform === 'win32'
    ? a.toLocaleLowerCase('en-US') === b.toLocaleLowerCase('en-US')
    : a === b;
}

export function bookTypeFromUri(uri: BookUri): 'txt' | 'epub' {
  const value = rawUri(uri).split(/[?#]/, 1)[0]!.toLowerCase();
  if (value.endsWith('.txt')) return 'txt';
  if (value.endsWith('.epub')) return 'epub';
  throw new Error('Only .txt and .epub books are supported.');
}
