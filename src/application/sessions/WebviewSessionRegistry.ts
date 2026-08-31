import type { HostEvent } from '../../shared/protocol/messages';

export type SessionMessageSender = (event: HostEvent) => unknown;

/**
 * Registry for Webviews owned by this Extension Host process.
 *
 * It intentionally has no filesystem watcher, IPC server, or cross-process
 * lookup. Cross-window freshness is provided by RefreshCoordinator instead.
 */
export class WebviewSessionRegistry {
  private readonly sessions = new Map<string, SessionMessageSender>();

  register(sessionId: string, sender: SessionMessageSender): () => void {
    if (sessionId.length === 0) throw new TypeError('Session ID is required.');
    if (typeof sender !== 'function')
      throw new TypeError('Session sender must be a function.');

    this.sessions.set(sessionId, sender);
    return () => {
      if (this.sessions.get(sessionId) === sender)
        this.sessions.delete(sessionId);
    };
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  broadcast(event: HostEvent): void {
    for (const sender of this.sessions.values()) {
      try {
        void Promise.resolve(sender(event)).catch(() => undefined);
      } catch {
        // A disposed Webview must not prevent other local sessions from
        // receiving the notification.
      }
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
