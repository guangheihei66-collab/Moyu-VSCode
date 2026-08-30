import type { TxtIndexManifest } from './txtIndex';

export interface TxtLocator {
  kind: 'txt';
  blockId: string;
  characterOffset: number;
  contentFingerprint: string;
}

export interface ReaderBlock {
  id: string;
  paragraphs: readonly string[];
  decodedLength: number;
  contentFingerprint: string;
}

export interface ReaderBlockBatch {
  blocks: readonly ReaderBlock[];
  atStart: boolean;
  atEnd: boolean;
}

export function isTxtLocator(value: unknown): value is TxtLocator {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TxtLocator>;
  return (
    candidate.kind === 'txt' &&
    typeof candidate.blockId === 'string' &&
    candidate.blockId.length > 0 &&
    Number.isSafeInteger(candidate.characterOffset) &&
    (candidate.characterOffset ?? -1) >= 0 &&
    typeof candidate.contentFingerprint === 'string' &&
    candidate.contentFingerprint.length > 0
  );
}

export function locatorForBlock(
  manifest: TxtIndexManifest,
  blockIndex: number,
  characterOffset = 0,
): TxtLocator | undefined {
  const block = manifest.blocks[blockIndex];
  if (block === undefined) return undefined;
  return {
    kind: 'txt',
    blockId: block.blockId,
    characterOffset: Math.max(
      0,
      Math.min(characterOffset, block.decodedLength),
    ),
    contentFingerprint: block.contentFingerprint,
  };
}
