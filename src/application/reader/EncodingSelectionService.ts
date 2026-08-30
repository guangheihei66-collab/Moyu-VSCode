import { type VersionedEnvelope } from '../../domain/persistence/envelope';
import type { BookMetadata } from '../../domain/books/types';
import {
  previewEncoding,
  type TxtEncoding,
} from '../../infrastructure/txt/encoding';
import type {
  BookshelfData,
  BookshelfOperation,
} from '../persistence/repositories';

export class EncodingSelectionError extends Error {
  constructor(
    readonly code: 'ENCODING_AMBIGUOUS' | 'BOOK_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'EncodingSelectionError';
  }
}

export interface EncodingBookshelfRepository {
  read(): Promise<VersionedEnvelope<BookshelfData> | undefined>;
  mutate(
    baseVersion: number,
    operation: BookshelfOperation,
  ): Promise<VersionedEnvelope<BookshelfData>>;
}

export class EncodingSelectionService {
  constructor(private readonly repository: EncodingBookshelfRepository) {}

  previewEncoding(
    uri: string,
    encoding: TxtEncoding,
    maxChars = 4_000,
  ): Promise<string> {
    return previewEncoding(uri, encoding, maxChars);
  }

  async commitCandidateWithoutConfirmation(): Promise<never> {
    throw new EncodingSelectionError(
      'ENCODING_AMBIGUOUS',
      'A candidate encoding must be explicitly confirmed first.',
    );
  }

  async confirmEncoding(
    bookId: string,
    encoding: TxtEncoding,
    baseVersion: number,
  ): Promise<BookMetadata> {
    const state = await this.repository.read();
    const book = state?.data.books.find((item) => item.id === bookId);
    if (state === undefined || book === undefined)
      throw new EncodingSelectionError(
        'BOOK_NOT_FOUND',
        'Book was not found in the bookshelf.',
      );
    const operation: BookshelfOperation = {
      kind: 'setEncoding',
      bookId,
      encoding,
    };
    const result = await this.repository.mutate(baseVersion, operation);
    return (result.data.books.find((item) => item.id === bookId) ??
      book) as unknown as BookMetadata;
  }
}
