import type {
  HostRequest,
  HostResponse,
} from '../../src/shared/protocol/messages';

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
  constructor(
    private readonly api: VsCodeApi,
    private readonly timeoutMs = 10_000,
  ) {}
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
  handleMessage(message: HostResponse): boolean {
    const pending = this.pending.get(message.payload.requestId);
    if (pending === undefined) return false;
    this.pending.delete(message.payload.requestId);
    globalThis.clearTimeout(pending.timer);
    pending.resolve(message);
    return true;
  }
  dispose(): void {
    for (const pending of this.pending.values()) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(new Error('Moyu Webview was disposed.'));
    }
    this.pending.clear();
  }
}
