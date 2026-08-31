import type {
  Game2048State,
  HostRequest,
  HostResponse,
  LogicalLocator,
  ReaderBlockBatch,
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

  async open(bookId: string): Promise<{
    version: number;
    anchor: LogicalLocator | null;
  }> {
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
    return {
      version: response.payload.snapshot.version,
      anchor: response.payload.snapshot.anchor,
    };
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

  async load(): Promise<
    { version: number; data: { state: Game2048State } } | undefined
  > {
    return this.requestGameSession({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'game2048/load',
      payload: {},
    });
  }

  async save(
    baseVersion: number,
    state: Game2048State,
  ): Promise<{ version: number; data: { state: Game2048State } }> {
    const session = await this.requestGameSession({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'game2048/save',
      payload: { baseVersion, state },
    });
    if (session === undefined) {
      throw new Error('The Host returned no saved 2048 session.');
    }
    return session;
  }

  async newGame(
    baseVersion: number,
  ): Promise<{ version: number; data: { state: Game2048State } }> {
    const session = await this.requestGameSession({
      protocol: PROTOCOL_VERSION,
      id: this.createRequestId(),
      sessionId: this.sessionId,
      type: 'game2048/newGame',
      payload: { baseVersion },
    });
    if (session === undefined) {
      throw new Error('The Host returned no new 2048 session.');
    }
    return session;
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

  private throwIfError(response: HostResponse): void {
    if (response.type === 'response/error') {
      throw new Error(response.payload.error.message);
    }
  }

  private async requestGameSession(
    request: Extract<
      HostRequest,
      {
        type: 'game2048/load' | 'game2048/save' | 'game2048/newGame';
      }
    >,
  ): Promise<{ version: number; data: { state: Game2048State } } | undefined> {
    const response = await this.request(request);
    this.throwIfError(response);
    if (response.type !== 'game2048/session') {
      throw new Error('The Host returned an unexpected 2048 session response.');
    }
    return response.payload.session === null
      ? undefined
      : {
          version: response.payload.session.version,
          data: { state: response.payload.session.state },
        };
  }
}
