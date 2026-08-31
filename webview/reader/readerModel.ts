import type { ReaderBlock } from '../../src/domain/reader/locator';

export type ReaderDocumentType = 'txt' | 'epub';

export interface ReaderPresentationModel {
  bookId: string;
  title: string;
  type: ReaderDocumentType;
  percentage: number;
  chapterTitle?: string;
  paragraphs: readonly string[];
  atStart: boolean;
  atEnd: boolean;
}

export interface ReaderPresentationMetadata {
  bookId: string;
  title?: string;
  type?: ReaderDocumentType;
  percentage?: number;
  chapterTitle?: string;
}

export function createReaderPresentationModel(
  metadata: ReaderPresentationMetadata,
  blocks: readonly ReaderBlock[],
  atStart = false,
  atEnd = false,
): ReaderPresentationModel {
  const title = metadata.title?.trim() || metadata.bookId;
  const chapterTitle = metadata.chapterTitle?.trim();
  return {
    bookId: metadata.bookId,
    title,
    type: metadata.type ?? 'txt',
    percentage: clampPercentage(metadata.percentage ?? 0),
    ...(chapterTitle === undefined || chapterTitle.length === 0
      ? {}
      : { chapterTitle }),
    paragraphs: blocks.flatMap((block) => block.paragraphs),
    atStart,
    atEnd,
  };
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
