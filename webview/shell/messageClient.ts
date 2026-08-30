import type {
  HostRequest,
  HostResponse,
} from '../../src/shared/protocol/messages';
import { PROTOCOL_VERSION } from '../../src/shared/protocol/messages';
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
}
