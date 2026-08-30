import type { ReaderBlock } from '../../src/domain/reader/locator';

export class BlockWindow {
  private mounted: ReaderBlock[] = [];

  constructor(private readonly maximumBlocks = 40) {
    if (!Number.isSafeInteger(maximumBlocks) || maximumBlocks < 1) {
      throw new RangeError('maximumBlocks must be a positive integer');
    }
  }

  get blocks(): readonly ReaderBlock[] {
    return this.mounted;
  }

  replace(blocks: readonly ReaderBlock[]): void {
    this.mounted = deduplicate(blocks).slice(-this.maximumBlocks);
  }

  append(blocks: readonly ReaderBlock[]): void {
    this.mounted = deduplicate([...this.mounted, ...blocks]).slice(
      -this.maximumBlocks,
    );
  }

  prepend(blocks: readonly ReaderBlock[]): void {
    this.mounted = deduplicate([...blocks, ...this.mounted]).slice(
      0,
      this.maximumBlocks,
    );
  }
}

function deduplicate(blocks: readonly ReaderBlock[]): ReaderBlock[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (seen.has(block.id)) return false;
    seen.add(block.id);
    return true;
  });
}
