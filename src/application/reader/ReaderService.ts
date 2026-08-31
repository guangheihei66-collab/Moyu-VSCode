import type { VersionedEnvelope } from '../../domain/persistence/envelope';
import {
  isTxtLocator,
  locatorForBlock,
  type ReaderBlockBatch,
  type TxtLocator,
} from '../../domain/reader/locator';
import type { TxtIndexManifest } from '../../domain/reader/txtIndex';
import type {
  ProgressData,
  ReadingCheckpoint,
} from '../persistence/repositories';
import { recoverLocator } from './progressRecovery';

export interface ReaderProgressRepository {
  read(): Promise<VersionedEnvelope<ProgressData> | undefined>;
  save(
    bookId: string,
    baseVersion: number,
    checkpoint: ReadingCheckpoint,
  ): Promise<VersionedEnvelope<ProgressData>>;
}

export interface ReaderBlockReader {
  readBlocks(
    bookId: string,
    anchor: TxtLocator,
    direction: 'before' | 'after',
    limit: number,
  ): Promise<ReaderBlockBatch>;
  loadIndex(bookId: string): Promise<TxtIndexManifest>;
}

export interface ReaderServiceOptions {
  blockReader: ReaderBlockReader;
  progress: ReaderProgressRepository;
  bookProvider?: (bookId: string) => Promise<{ id: string } | undefined>;
  clock?: () => number;
}

export interface ReaderOpenState {
  version: number;
  locator: TxtLocator | undefined;
}

export class ReaderService {
  private readonly clock: () => number;

  constructor(private readonly options: ReaderServiceOptions) {
    this.clock = options.clock ?? Date.now;
  }

  readBlocks(
    bookId: string,
    anchor: TxtLocator,
    direction: 'before' | 'after',
    limit: number,
  ): Promise<ReaderBlockBatch> {
    return this.options.blockReader.readBlocks(
      bookId,
      anchor,
      direction,
      limit,
    );
  }

  /** Resolves the durable start locator before any Webview block request. */
  async open(bookId: string): Promise<ReaderOpenState> {
    await this.ensureBook(bookId);
    // Index and source work stays independent of the progress transaction.
    const index = await this.options.blockReader.loadIndex(bookId);
    const state = await this.options.progress.read();
    const checkpoint = state?.data.byBookId[bookId];
    const restored =
      checkpoint !== undefined && isTxtLocator(checkpoint.locator)
        ? recoverLocator(checkpoint.locator, index, checkpoint.percentage)
        : undefined;
    return {
      version: state?.version ?? 0,
      locator: restored ?? locatorForBlock(index, 0),
    };
  }

  async saveProgress(
    bookId: string,
    baseVersion: number,
    locator: TxtLocator,
  ): Promise<VersionedEnvelope<ProgressData>> {
    await this.ensureBook(bookId);
    if (!isTxtLocator(locator)) {
      throw new Error('The TXT reading locator is invalid.');
    }
    const index = await this.options.blockReader.loadIndex(bookId);
    const recovered = recoverLocator(locator, index);
    if (recovered === undefined) {
      throw new Error('Cannot save progress for an empty TXT book.');
    }
    return this.options.progress.save(bookId, baseVersion, {
      locator: recovered,
      percentage: percentageForLocator(recovered, index),
      updatedAt: this.clock(),
    });
  }

  async restore(bookId: string): Promise<TxtLocator | undefined> {
    await this.ensureBook(bookId);
    const state = await this.options.progress.read();
    const checkpoint = state?.data.byBookId[bookId];
    if (checkpoint === undefined || !isTxtLocator(checkpoint.locator))
      return undefined;
    const index = await this.options.blockReader.loadIndex(bookId);
    return recoverLocator(checkpoint.locator, index, checkpoint.percentage);
  }

  private async ensureBook(bookId: string): Promise<void> {
    if (this.options.bookProvider === undefined) return;
    if ((await this.options.bookProvider(bookId)) === undefined)
      throw new Error('Book was not found.');
  }
}

function percentageForLocator(
  locator: TxtLocator,
  index: TxtIndexManifest,
): number {
  const blockIndex = index.blocks.findIndex(
    (block) =>
      block.blockId === locator.blockId &&
      block.contentFingerprint === locator.contentFingerprint,
  );
  if (blockIndex < 0) return 0;
  const total = index.blocks.reduce(
    (sum, block) => sum + block.decodedLength,
    0,
  );
  if (total === 0) return 0;
  const before = index.blocks
    .slice(0, blockIndex)
    .reduce((sum, block) => sum + block.decodedLength, 0);
  return Math.max(0, Math.min(1, (before + locator.characterOffset) / total));
}
