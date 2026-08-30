import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BookMetadata, TxtEncoding } from '../../domain/books/types';
import type {
  TxtIndexEntry,
  TxtIndexManifest,
} from '../../domain/reader/txtIndex';
import { decodeText } from './encoding';
import { createIndexManifest } from './indexManifest';
import { IndexStore } from './indexStore';

export type IndexProgress = (progress: {
  bytesRead: number;
  totalBytes: number;
  blocks: number;
}) => void;

interface EncodedUnit {
  start: number;
  end: number;
}

function sourcePath(uri: string): string {
  return uri.toLowerCase().startsWith('file:') ? fileURLToPath(uri) : uri;
}

function continuation(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function encodedUnitLength(
  bytes: Uint8Array,
  offset: number,
  encoding: TxtEncoding,
): number | undefined {
  const remaining = bytes.length - offset;
  if (encoding === 'utf8') {
    const first = bytes[offset]!;
    if (first <= 0x7f) return 1;
    if (first >= 0xc2 && first <= 0xdf) {
      if (remaining < 2) return undefined;
      if (!continuation(bytes[offset + 1]!))
        throw new Error('Invalid UTF-8 byte while indexing.');
      return 2;
    }
    if (first >= 0xe0 && first <= 0xef) {
      if (remaining < 3) return undefined;
      const second = bytes[offset + 1]!;
      if (
        !continuation(second) ||
        (first === 0xe0 && second < 0xa0) ||
        (first === 0xed && second > 0x9f) ||
        !continuation(bytes[offset + 2]!)
      ) {
        throw new Error('Invalid UTF-8 byte while indexing.');
      }
      return 3;
    }
    if (first >= 0xf0 && first <= 0xf4) {
      if (remaining < 4) return undefined;
      const second = bytes[offset + 1]!;
      if (
        !continuation(second) ||
        (first === 0xf0 && second < 0x90) ||
        (first === 0xf4 && second > 0x8f) ||
        !continuation(bytes[offset + 2]!) ||
        !continuation(bytes[offset + 3]!)
      ) {
        throw new Error('Invalid UTF-8 byte while indexing.');
      }
      return 4;
    }
    throw new Error('Invalid UTF-8 byte while indexing.');
  }

  if (encoding === 'utf16le' || encoding === 'utf16be') {
    if (remaining < 2) return undefined;
    const high =
      encoding === 'utf16be'
        ? (bytes[offset]! << 8) | bytes[offset + 1]!
        : bytes[offset]! | (bytes[offset + 1]! << 8);
    if (high >= 0xd800 && high <= 0xdbff && remaining >= 4) {
      const low =
        encoding === 'utf16be'
          ? (bytes[offset + 2]! << 8) | bytes[offset + 3]!
          : bytes[offset + 2]! | (bytes[offset + 3]! << 8);
      if (low >= 0xdc00 && low <= 0xdfff) return 4;
    }
    return 2;
  }

  const first = bytes[offset]!;
  if (first <= 0x7f || first === 0x80) return 1;
  if (remaining < 2) return undefined;
  if (
    encoding === 'gb18030' &&
    bytes[offset + 1]! >= 0x30 &&
    bytes[offset + 1]! <= 0x39
  ) {
    return remaining >= 4 ? 4 : undefined;
  }
  return 2;
}

function bomLength(
  bytes: Uint8Array,
  encoding: TxtEncoding,
  atEnd: boolean,
): number | undefined {
  if (encoding === 'utf8') {
    if (bytes.length === 0 || bytes[0] !== 0xef) return 0;
    if (bytes.length < 3) return atEnd ? 0 : undefined;
    return bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  }
  if (encoding === 'utf16le' || encoding === 'utf16be') {
    if (bytes.length < 2) return atEnd ? 0 : undefined;
    const isLeBom = bytes[0] === 0xff && bytes[1] === 0xfe;
    const isBeBom = bytes[0] === 0xfe && bytes[1] === 0xff;
    if (encoding === 'utf16le' && isLeBom) return 2;
    if (encoding === 'utf16be' && isBeBom) return 2;
    return 0;
  }
  return 0;
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new Error('Index build was cancelled.');
}

export class TxtIndexer {
  private readonly store: IndexStore | undefined;
  private readonly blockTargetChars: number;

  constructor(options: { store?: IndexStore; blockTargetChars?: number } = {}) {
    this.store = options.store;
    this.blockTargetChars = options.blockTargetChars ?? 8_192;
    if (
      !Number.isSafeInteger(this.blockTargetChars) ||
      this.blockTargetChars <= 0
    ) {
      throw new RangeError('TXT block target must be a positive integer.');
    }
  }

  async build(
    book: BookMetadata,
    signal: AbortSignal,
    onProgress: IndexProgress = () => undefined,
  ): Promise<TxtIndexManifest> {
    if (book.type !== 'txt' || book.encoding === undefined) {
      throw new Error('A confirmed TXT encoding is required before indexing.');
    }
    abortIfNeeded(signal);

    const encoding = book.encoding;
    const stream = createReadStream(sourcePath(book.uri), {
      highWaterMark: 64 * 1024,
    });
    let pending = new Uint8Array(0);
    let absoluteByteOffset = 0;
    let bytesRead = 0;
    let bomDecided = false;
    let blockStart: number | undefined;
    let blockEnd = 0;
    let blockDecodedLength = 0;
    let blockParagraphCount = 0;
    let blockHash = createHash('sha256');
    let bufferedHashText = '';
    let paragraphStart: number | undefined;
    let lastEndedWithCr = false;
    const blocks: TxtIndexEntry[] = [];

    const ensureBlock = (start: number): void => {
      if (blockStart === undefined) {
        blockStart = start;
        blockHash = createHash('sha256');
        bufferedHashText = '';
      }
    };

    const addToHash = (text: string): void => {
      bufferedHashText += text;
      if (bufferedHashText.length >= 4_096) {
        blockHash.update(bufferedHashText, 'utf8');
        bufferedHashText = '';
      }
    };

    const finishBlock = (): void => {
      if (blockStart === undefined) return;
      if (bufferedHashText.length > 0) {
        blockHash.update(bufferedHashText, 'utf8');
        bufferedHashText = '';
      }
      blocks.push({
        blockId: `block-${blocks.length}`,
        byteStart: blockStart,
        byteEnd: blockEnd,
        decodedLength: blockDecodedLength,
        paragraphCount: blockParagraphCount,
        contentFingerprint: blockHash.digest('hex'),
      });
      blockStart = undefined;
      blockEnd = 0;
      blockDecodedLength = 0;
      blockParagraphCount = 0;
    };

    const maybeFinishBlock = (): void => {
      if (
        blockStart !== undefined &&
        blockParagraphCount > 0 &&
        blockDecodedLength >= this.blockTargetChars
      ) {
        finishBlock();
      }
    };

    const finishParagraph = (
      boundaryStart: number,
      boundaryEnd: number,
      hasSeparator: boolean,
    ): void => {
      ensureBlock(paragraphStart ?? boundaryStart);
      if (hasSeparator) {
        addToHash('\n');
        blockDecodedLength += 1;
      }
      blockEnd = boundaryEnd;
      blockParagraphCount += 1;
      paragraphStart = undefined;
    };

    const consumeCharacter = (
      character: string,
      start: number,
      end: number,
    ): void => {
      if (character === '\n') {
        if (lastEndedWithCr) {
          blockEnd = end;
          lastEndedWithCr = false;
          maybeFinishBlock();
        } else {
          finishParagraph(start, end, true);
          maybeFinishBlock();
        }
        return;
      }

      if (character === '\r') {
        if (lastEndedWithCr) {
          maybeFinishBlock();
          lastEndedWithCr = false;
        }
        finishParagraph(start, end, true);
        lastEndedWithCr = true;
        return;
      }

      if (lastEndedWithCr) {
        maybeFinishBlock();
        lastEndedWithCr = false;
      }
      if (paragraphStart === undefined) paragraphStart = start;
      ensureBlock(paragraphStart);
      addToHash(character);
      blockDecodedLength += 1;
      blockEnd = end;
    };

    const consumeBuffer = (buffer: Uint8Array, atEnd: boolean): number => {
      let cursor = 0;
      if (!bomDecided) {
        const detectedBomLength = bomLength(buffer, encoding, atEnd);
        if (detectedBomLength === undefined) return 0;
        bomDecided = true;
        cursor = detectedBomLength;
      }

      const units: EncodedUnit[] = [];
      const unitStart = cursor;
      while (cursor < buffer.length) {
        const length = encodedUnitLength(buffer, cursor, encoding);
        if (length === undefined || cursor + length > buffer.length) break;
        units.push({
          start: absoluteByteOffset + cursor,
          end: absoluteByteOffset + cursor + length,
        });
        cursor += length;
      }
      if (units.length > 0) {
        const decoded = decodeText(
          buffer.subarray(unitStart, cursor),
          encoding,
          Number.MAX_SAFE_INTEGER,
        );
        const characters = Array.from(decoded);
        if (characters.length !== units.length) {
          throw new Error('TXT decoder boundary did not remain one-to-one.');
        }
        characters.forEach((character, index) => {
          const unit = units[index]!;
          consumeCharacter(character, unit.start, unit.end);
        });
      }
      return cursor;
    };

    try {
      for await (const chunk of stream) {
        abortIfNeeded(signal);
        const incoming = new Uint8Array(chunk as Buffer);
        bytesRead += incoming.length;
        const combined = new Uint8Array(pending.length + incoming.length);
        combined.set(pending);
        combined.set(incoming, pending.length);
        const consumed = consumeBuffer(combined, false);
        absoluteByteOffset += consumed;
        pending = combined.subarray(consumed);
        onProgress({
          bytesRead,
          totalBytes: book.size,
          blocks: blocks.length,
        });
      }

      abortIfNeeded(signal);
      const consumed = consumeBuffer(pending, true);
      absoluteByteOffset += consumed;
      pending = pending.subarray(consumed);
      if (pending.length > 0) {
        throw new Error(
          'TXT source ended in the middle of an encoded character.',
        );
      }

      if (paragraphStart !== undefined) {
        finishParagraph(absoluteByteOffset, absoluteByteOffset, false);
      }
      maybeFinishBlock();
      finishBlock();
      const manifest = createIndexManifest(book, blocks);
      if (this.store !== undefined) await this.store.save(manifest, signal);
      return manifest;
    } finally {
      stream.destroy();
    }
  }
}
