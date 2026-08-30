import type { TxtLocator } from '../../domain/reader/locator';
import type { TxtIndexManifest } from '../../domain/reader/txtIndex';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function blockNumber(blockId: string): number | undefined {
  const match = /^block-(\d+)$/.exec(blockId);
  if (match === null) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

function closestIndex(
  indexes: readonly number[],
  expected: number,
): number | undefined {
  let closest: number | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const index of indexes) {
    const nextDistance = Math.abs(index - expected);
    if (nextDistance < distance) {
      closest = index;
      distance = nextDistance;
    }
  }
  return closest;
}

function percentageIndex(
  index: TxtIndexManifest,
  percentage: number,
): { index: number; offset: number } {
  const total = index.blocks.reduce(
    (sum, block) => sum + block.decodedLength,
    0,
  );
  if (total === 0) return { index: 0, offset: 0 };
  const target = clamp(percentage, 0, 1) * total;
  let consumed = 0;
  for (let blockIndex = 0; blockIndex < index.blocks.length; blockIndex += 1) {
    const block = index.blocks[blockIndex]!;
    if (
      target <= consumed + block.decodedLength ||
      blockIndex === index.blocks.length - 1
    ) {
      return {
        index: blockIndex,
        offset: clamp(Math.round(target - consumed), 0, block.decodedLength),
      };
    }
    consumed += block.decodedLength;
  }
  return {
    index: index.blocks.length - 1,
    offset: index.blocks.at(-1)!.decodedLength,
  };
}

/**
 * Restores a TXT anchor against a rebuilt index. A matching block fingerprint
 * wins over positional recovery; percentage is used only when the content is
 * no longer present in the rebuilt index.
 */
export function recoverLocator(
  oldLocator: TxtLocator,
  newIndex: TxtIndexManifest,
  percentage = 0,
): TxtLocator | undefined {
  if (newIndex.blocks.length === 0) return undefined;
  const expected = blockNumber(oldLocator.blockId) ?? 0;
  const exact = newIndex.blocks.findIndex(
    (block) =>
      block.blockId === oldLocator.blockId &&
      block.contentFingerprint === oldLocator.contentFingerprint,
  );
  const matches = newIndex.blocks.reduce<number[]>((result, block, index) => {
    if (block.contentFingerprint === oldLocator.contentFingerprint)
      result.push(index);
    return result;
  }, []);
  const matchingIndex = exact >= 0 ? exact : closestIndex(matches, expected);
  const target =
    matchingIndex === undefined
      ? percentageIndex(newIndex, percentage)
      : { index: matchingIndex, offset: oldLocator.characterOffset };
  const block = newIndex.blocks[target.index]!;
  return {
    kind: 'txt',
    blockId: block.blockId,
    characterOffset: clamp(target.offset, 0, block.decodedLength),
    contentFingerprint: block.contentFingerprint,
  };
}
