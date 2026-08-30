import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  IntervalScheduler,
  LockMetadata,
} from '../../../src/infrastructure/storage/fileLock';
import {
  createNodeFileOperations,
  type DurableFileHandle,
  type FileOperations,
} from '../../../src/infrastructure/storage/nodeFileOps';
import type { JsonTransactionPaths } from '../../../src/infrastructure/storage/recovery';

export interface TestState {
  generation: number;
  version: number;
  value: number;
}

export async function withStorageDirectory<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'moyu-storage-test-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function storagePaths(
  stateDirectory: string,
  moduleName = 'module',
): JsonTransactionPaths {
  return {
    stateDirectory,
    current: join(stateDirectory, `${moduleName}.json`),
    backup: join(stateDirectory, `${moduleName}.json.backup`),
    lock: join(stateDirectory, `${moduleName}.lock`),
  };
}

export function isTestState(value: unknown): value is TestState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<TestState>;
  return (
    Number.isSafeInteger(candidate.generation) &&
    Number.isSafeInteger(candidate.version) &&
    Number.isSafeInteger(candidate.value) &&
    (candidate.generation ?? -1) >= 0 &&
    (candidate.version ?? -1) >= 0
  );
}

export class ManualTime {
  value = 0;
  readonly sleeps: number[] = [];

  readonly now = (): number => this.value;

  readonly sleep = async (milliseconds: number): Promise<void> => {
    this.sleeps.push(milliseconds);
    this.value += milliseconds;
  };

  advance(milliseconds: number): void {
    this.value += milliseconds;
  }
}

export class ManualScheduler implements IntervalScheduler {
  private readonly callbacks = new Map<object, () => void | Promise<void>>();

  setInterval(callback: () => void | Promise<void>): object {
    const handle = {};
    this.callbacks.set(handle, callback);
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.callbacks.delete(handle as object);
  }

  async runAll(): Promise<void> {
    await Promise.all(
      [...this.callbacks.values()].map((callback) => callback()),
    );
  }

  get activeCount(): number {
    return this.callbacks.size;
  }
}

export async function writeLockMetadata(
  path: string,
  metadata: LockMetadata,
): Promise<void> {
  await writeFile(path, JSON.stringify(metadata), {
    encoding: 'utf8',
    flag: 'w',
  });
}

export async function listNames(directory: string): Promise<string[]> {
  return (await readdir(directory)).sort();
}

export type FileOperationName =
  | 'openExclusive'
  | 'writeUtf8'
  | 'sync'
  | 'close'
  | 'readUtf8'
  | 'entryKind'
  | 'rename'
  | 'unlink'
  | 'list';

export interface FileOperationEvent {
  operation: FileOperationName;
  path: string;
  destination?: string;
}

export class InstrumentedFileOperations implements FileOperations {
  readonly events: FileOperationEvent[] = [];

  constructor(
    private readonly fail?: (event: FileOperationEvent) => Error | undefined,
    private readonly base: FileOperations = createNodeFileOperations(),
  ) {}

  private record(event: FileOperationEvent): void {
    this.events.push(event);
    const failure = this.fail?.(event);
    if (failure !== undefined) {
      throw failure;
    }
  }

  async openExclusive(path: string): Promise<DurableFileHandle> {
    this.record({ operation: 'openExclusive', path });
    const handle = await this.base.openExclusive(path);
    return {
      writeUtf8: async (content) => {
        this.record({ operation: 'writeUtf8', path });
        await handle.writeUtf8(content);
      },
      sync: async () => {
        this.record({ operation: 'sync', path });
        await handle.sync();
      },
      close: async () => {
        this.record({ operation: 'close', path });
        await handle.close();
      },
    };
  }

  async readUtf8(path: string): Promise<string> {
    this.record({ operation: 'readUtf8', path });
    return this.base.readUtf8(path);
  }

  async entryKind(path: string) {
    this.record({ operation: 'entryKind', path });
    return this.base.entryKind(path);
  }

  async rename(source: string, destination: string): Promise<void> {
    this.record({ operation: 'rename', path: source, destination });
    await this.base.rename(source, destination);
  }

  async unlink(path: string): Promise<void> {
    this.record({ operation: 'unlink', path });
    await this.base.unlink(path);
  }

  async list(directory: string): Promise<string[]> {
    this.record({ operation: 'list', path: directory });
    return this.base.list(directory);
  }
}
