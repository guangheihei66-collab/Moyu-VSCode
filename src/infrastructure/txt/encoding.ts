import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as iconv from 'iconv-lite';
import { isStrictUtf8Prefix } from './strictUtf8';

export type TxtEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'gb18030' | 'gbk';

export type EncodingInspection =
  | { kind: 'confirmed'; encoding: TxtEncoding; bomBytes: number }
  | { kind: 'candidate'; encoding: 'gb18030'; requiresConfirmation: true };

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

export function inspectEncoding(bytes: Uint8Array): EncodingInspection {
  if (hasPrefix(bytes, [0xef, 0xbb, 0xbf]))
    return { kind: 'confirmed', encoding: 'utf8', bomBytes: 3 };
  if (hasPrefix(bytes, [0xff, 0xfe]))
    return { kind: 'confirmed', encoding: 'utf16le', bomBytes: 2 };
  if (hasPrefix(bytes, [0xfe, 0xff]))
    return { kind: 'confirmed', encoding: 'utf16be', bomBytes: 2 };
  if (isStrictUtf8Prefix(bytes))
    return { kind: 'confirmed', encoding: 'utf8', bomBytes: 0 };
  return { kind: 'candidate', encoding: 'gb18030', requiresConfirmation: true };
}

function localPath(uri: string): string {
  return uri.toLowerCase().startsWith('file:') ? fileURLToPath(uri) : uri;
}

async function readPrefix(uri: string, maxBytes: number): Promise<Uint8Array> {
  const handle = await open(localPath(uri), 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export function decodeText(
  bytes: Uint8Array,
  encoding: TxtEncoding,
  maxChars = 4_000,
): string {
  if (!Number.isSafeInteger(maxChars) || maxChars < 0)
    throw new RangeError('Preview character limit must be non-negative.');
  const decoded = iconv.decode(Buffer.from(bytes), encoding);
  return Array.from(decoded).slice(0, maxChars).join('');
}

export async function previewEncoding(
  uri: string,
  encoding: TxtEncoding,
  maxChars = 4_000,
): Promise<string> {
  const bytes = await readPrefix(uri, Math.max(1, maxChars * 4 + 4));
  let content = bytes;
  if (encoding === 'utf8' && hasPrefix(bytes, [0xef, 0xbb, 0xbf]))
    content = bytes.subarray(3);
  if (encoding === 'utf16le' || encoding === 'utf16be') {
    if (hasPrefix(bytes, [0xff, 0xfe]) || hasPrefix(bytes, [0xfe, 0xff]))
      content = bytes.subarray(2);
  }
  return decodeText(content, encoding, maxChars);
}
