export type RefreshTarget = 'bookshelf' | 'reader' | 'settings';

export interface RefreshRepository<T = unknown> {
  /** Preferred name for repositories that explicitly expose latest-read semantics. */
  readLatest?: () => Promise<T>;
  /** Existing Moyu repositories use this locked, recovery-aware read boundary. */
  read?: () => Promise<T>;
}

export type RefreshRepositories = Partial<
  Record<RefreshTarget, RefreshRepository>
>;

export interface RefreshOptions {
  readonly signal?: AbortSignal;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { aborted?: unknown }).aborted === 'boolean' &&
    typeof (value as { addEventListener?: unknown }).addEventListener ===
      'function'
  );
}

function signalFrom(
  optionsOrSignal: RefreshOptions | AbortSignal | undefined,
): AbortSignal | undefined {
  if (isAbortSignal(optionsOrSignal)) return optionsOrSignal;
  return optionsOrSignal?.signal;
}

/**
 * Rereads a module at explicit lifecycle boundaries.
 *
 * This class does not cache, poll, watch files, or communicate with another
 * Extension Host. Every call reaches the repository's locked read boundary.
 */
export class RefreshCoordinator {
  constructor(private readonly repositories: RefreshRepositories) {}

  onCreated<T = unknown>(
    target: RefreshTarget,
    optionsOrSignal?: RefreshOptions | AbortSignal,
  ): Promise<T | undefined> {
    return this.refresh<T>(target, optionsOrSignal);
  }

  onRevealed<T = unknown>(
    target: RefreshTarget,
    optionsOrSignal?: RefreshOptions | AbortSignal,
  ): Promise<T | undefined> {
    return this.refresh<T>(target, optionsOrSignal);
  }

  onNavigated<T = unknown>(
    target: RefreshTarget,
    optionsOrSignal?: RefreshOptions | AbortSignal,
  ): Promise<T | undefined> {
    return this.refresh<T>(target, optionsOrSignal);
  }

  beforeMutation<T = unknown>(
    target: RefreshTarget,
    optionsOrSignal?: RefreshOptions | AbortSignal,
  ): Promise<T | undefined> {
    return this.refresh<T>(target, optionsOrSignal);
  }

  private async refresh<T>(
    target: RefreshTarget,
    optionsOrSignal?: RefreshOptions | AbortSignal,
  ): Promise<T | undefined> {
    const signal = signalFrom(optionsOrSignal);
    if (signal?.aborted) throw this.abortError(signal);

    const repository = this.repositories[target] as
      | RefreshRepository<T>
      | undefined;
    if (repository === undefined) return undefined;

    const read = repository.readLatest ?? repository.read;
    if (read === undefined) return undefined;
    const value = await this.readWithCancellation(
      () => read.call(repository),
      signal,
    );
    if (signal?.aborted) throw this.abortError(signal);
    return value;
  }

  private async readWithCancellation<T>(
    read: () => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    if (signal === undefined) return read();

    let removeAbortListener: () => void = () => undefined;
    const cancellation = new Promise<never>((_, reject) => {
      const rejectCancellation = () => reject(this.abortError(signal));
      signal.addEventListener('abort', rejectCancellation, { once: true });
      removeAbortListener = () =>
        signal.removeEventListener('abort', rejectCancellation);
    });
    try {
      return await Promise.race([read(), cancellation]);
    } finally {
      removeAbortListener();
    }
  }

  private abortError(signal: AbortSignal): Error {
    if (signal.reason instanceof Error) return signal.reason;
    const error = new Error('The refresh was cancelled.');
    error.name = 'AbortError';
    return error;
  }
}
