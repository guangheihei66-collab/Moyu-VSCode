const KiB = 1024;
const MiB = 1024 * KiB;

export const EPUB_LIMITS = Object.freeze({
  sourceBytes: 256 * MiB,
  entries: 4096,
  entryBytes: 16 * MiB,
  expandedBytes: 512 * MiB,
  compressionRatio: 100,
  containerXmlBytes: 256 * KiB,
  opfBytes: 4 * MiB,
  chapters: 2048,
  chapterMarkupBytes: 8 * MiB,
  chapterTextBytes: 4 * MiB,
  markupDepth: 64,
  messageBytes: 1 * MiB,
});

export type EpubErrorCode =
  | 'EPUB_LIMIT_EXCEEDED'
  | 'EPUB_UNSAFE_PATH'
  | 'EPUB_UNSAFE_XML'
  | 'EPUB_INVALID_ARCHIVE';

export class EpubSecurityError extends Error {
  constructor(
    readonly code: EpubErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EpubSecurityError';
  }
}

export function assertWithinLimit(
  name: string,
  actual: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(actual) || actual < 0 || actual > maximum) {
    throw new EpubSecurityError(
      'EPUB_LIMIT_EXCEEDED',
      `${name} exceeds the EPUB safety limit`,
    );
  }
}
