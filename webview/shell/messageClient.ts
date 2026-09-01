import type {
  BookshelfSnapshot,
  EpubChapterListSnapshot,
  EpubChapterSnapshot,
  HomeSnapshot,
  HostRequest,
  HostResponse,
  LogicalLocator,
  ReaderBlockBatch,
  ReaderOpenSnapshot,
  ReaderProgressSnapshot,
} from '../../src/shared/protocol/messages';
import { PROTOCOL_VERSION } from '../../src/shared/protocol/messages';
import type { BossMode } from '../../src/domain/boss/types';
import type {
  ReaderSettingsPatch,
  ReaderSettingsSnapshot,
} from '../../src/domain/reader/settings';
import { validateHostResponse } from '../../src/shared/protocol/validate';

interface VsCodeApi {
  postMessage(message: HostRequest): void;
}
type Pending = {
  resolve: (value: HostResponse) => void;
  reject: (error: Error) => void;
  timer: number;
};

export class MessageClient {
  private readonly pending = new Map<string, Pending>();
  private readonly nextId: () => string;
  private requestSequence = 0;

  constructor(
    private readonly api: VsCodeApi,
    private readonly sessionId = '',
    private readonly timeoutMs = 10_000,
    nextId?: () => string,
  ) {
    this.nextId = nextId ?? (() => `request-${++this.requestSequence}`);
  }

  request(request: HostRequest): Promise<HostResponse> {
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Timed out waiting for request ${request.id}.`));
      }, this.timeoutMs) as unknown as number;
      this.pending.set(request.id, { resolve, reject, timer });
      this.api.postMessage(request);
    });
  }
  handleMessage(value: unknown): boolean {
    const validation = validateHostResponse(value);
    if (!validation.ok) return false;
    const message = validation.value;
    if (this.sessionId !== '' && message.sessionId !== this.sessionId)
      return false;
    const pending = this.pending.get(message.payload.requestId);
    if (pending === undefined) return false;
    this.pending.delete(message.payload.requestId);
    globalThis.clearTimeout(pending.timer);
    pending.resolve(message);
    return true;
  }

  readSettings(): Promise<ReaderSettingsSnapshot> {
    return this.requestSettings({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'settings/read',
      payload: {},
    });
  }

  async readHome(): Promise<HomeSnapshot> {
    const response = await this.request({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'home/read',
      payload: {},
    });
    this.throwIfError(response);
    if (response.type !== 'home/snapshot') {
      throw new Error('The Host returned an unexpected Home response.');
    }
    return response.payload.snapshot;
  }

  readBooks(): Promise<BookshelfSnapshot> {
    return this.requestBooks({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'books/list',
      payload: {},
    });
  }

  importBook(): Promise<BookshelfSnapshot> {
    return this.requestBooks({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'books/import',
      payload: {},
    });
  }

  relocateBook(bookId: string): Promise<BookshelfSnapshot> {
    return this.requestBooks({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'books/relocate',
      payload: { bookId },
    });
  }

  selectBookEncoding(bookId: string): Promise<BookshelfSnapshot> {
    return this.requestBooks({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'books/selectEncoding',
      payload: { bookId },
    });
  }

  removeBook(bookId: string): Promise<BookshelfSnapshot> {
    return this.requestBooks({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'books/remove',
      payload: { bookId },
    });
  }

  updateSettings(
    baseVersion: number,
    patch: ReaderSettingsPatch,
  ): Promise<ReaderSettingsSnapshot> {
    return this.requestSettings({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'settings/update',
      payload: { baseVersion, patch },
    });
  }

  async open(bookId: string): Promise<ReaderOpenSnapshot> {
    const response = await this.request({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'reader/open',
      payload: { bookId },
    });
    this.throwIfError(response);
    if (
      response.type !== 'reader/opened' ||
      response.payload.snapshot.bookId !== bookId
    ) {
      throw new Error('The Host returned an unexpected reader-open response.');
    }
    return response.payload.snapshot;
  }

  listChapters(bookId: string): Promise<EpubChapterListSnapshot> {
    return this.requestReaderChapterList({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'reader/listChapters',
      payload: { bookId },
    });
  }

  openChapter(bookId: string, chapterId: string): Promise<EpubChapterSnapshot> {
    return this.requestReaderChapter({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'reader/openChapter',
      payload: { bookId, chapterId },
    });
  }

  navigateChapter(
    bookId: string,
    chapterId: string,
    direction: 'previous' | 'next',
  ): Promise<EpubChapterSnapshot> {
    return this.requestReaderChapter({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'reader/navigateChapter',
      payload: { bookId, chapterId, direction },
    });
  }

  async readBlocks(
    bookId: string,
    anchor: LogicalLocator,
    direction: 'before' | 'after',
    limit: number,
  ): Promise<ReaderBlockBatch> {
    const response = await this.request({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'reader/readBlocks',
      payload: { bookId, anchor, direction, limit },
    });
    this.throwIfError(response);
    if (response.type !== 'reader/blocks') {
      throw new Error('The Host returned an unexpected reader-block response.');
    }
    return response.payload.batch;
  }

  async saveProgress(
    bookId: string,
    baseVersion: number,
    locator: LogicalLocator,
  ): Promise<ReaderProgressSnapshot> {
    const response = await this.request({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'reader/saveProgress',
      payload: { bookId, baseVersion, locator },
    });
    this.throwIfError(response);
    if (response.type !== 'reader/progressSaved') {
      throw new Error(
        'The Host returned an unexpected reader-progress response.',
      );
    }
    return response.payload.snapshot;
  }

  acknowledgeBoss(requestId: string, mode: BossMode): void {
    this.api.postMessage({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'boss/ack',
      payload: { requestId, mode },
    });
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(new Error('Moyu Webview was disposed.'));
    }
    this.pending.clear();
  }

  private createRequestId(): string {
    if (this.sessionId.length === 0)
      throw new Error('Moyu Webview session is missing.');
    return this.nextId();
  }

  private async requestSettings(
    request: Extract<
      HostRequest,
      { type: 'settings/read' | 'settings/update' }
    >,
  ): Promise<ReaderSettingsSnapshot> {
    const response = await this.request(request);
    if (response.type === 'response/error')
      throw new Error(response.payload.error.message);
    if (response.type !== 'settings/snapshot')
      throw new Error('The Host returned an unexpected settings response.');
    return response.payload.snapshot;
  }

  private async requestBooks(
    request: Extract<
      HostRequest,
      {
        type:
          | 'books/list'
          | 'books/import'
          | 'books/relocate'
          | 'books/selectEncoding'
          | 'books/remove';
      }
    >,
  ): Promise<BookshelfSnapshot> {
    const response = await this.request(request);
    this.throwIfError(response);
    if (response.type !== 'books/snapshot') {
      throw new Error('The Host returned an unexpected bookshelf response.');
    }
    return response.payload.snapshot;
  }

  private async requestReaderChapterList(
    request: Extract<HostRequest, { type: 'reader/listChapters' }>,
  ): Promise<EpubChapterListSnapshot> {
    const response = await this.request(request);
    this.throwIfError(response);
    if (
      response.type !== 'reader/chapters' ||
      response.payload.snapshot.bookId !== request.payload.bookId
    ) {
      throw new Error('The Host returned an unexpected chapter-list response.');
    }
    return response.payload.snapshot;
  }

  private async requestReaderChapter(
    request: Extract<
      HostRequest,
      { type: 'reader/openChapter' | 'reader/navigateChapter' }
    >,
  ): Promise<EpubChapterSnapshot> {
    const response = await this.request(request);
    this.throwIfError(response);
    if (
      response.type !== 'reader/chapter' ||
      response.payload.snapshot.bookId !== request.payload.bookId ||
      response.payload.snapshot.chapterId !== request.payload.chapterId
    ) {
      throw new Error('The Host returned an unexpected chapter response.');
    }
    return response.payload.snapshot;
  }

  private throwIfError(response: HostResponse): void {
    if (response.type === 'response/error') {
      throw new Error(response.payload.error.message);
    }
  }
}
