import {
  lstat,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

export type FileEntryKind = 'file' | 'symbolic-link' | 'other' | 'missing';

export interface DurableFileHandle {
  writeUtf8(content: string): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface FileOperations {
  openExclusive(path: string): Promise<DurableFileHandle>;
  readUtf8(path: string): Promise<string>;
  entryKind(path: string): Promise<FileEntryKind>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
  list(directory: string): Promise<string[]>;
}

class NodeDurableFileHandle implements DurableFileHandle {
  constructor(private readonly handle: FileHandle) {}

  async writeUtf8(content: string): Promise<void> {
    const bytes = Buffer.from(content, 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await this.handle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesWritten === 0) {
        throw new Error('File write made no progress.');
      }
      offset += bytesWritten;
    }
    await this.handle.truncate(bytes.length);
  }

  async sync(): Promise<void> {
    await this.handle.sync();
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

export function createNodeFileOperations(): FileOperations {
  return {
    async openExclusive(path) {
      return new NodeDurableFileHandle(await open(path, 'wx'));
    },
    async readUtf8(path) {
      return readFile(path, 'utf8');
    },
    async entryKind(path) {
      try {
        const stat = await lstat(path);
        if (stat.isSymbolicLink()) {
          return 'symbolic-link';
        }
        return stat.isFile() ? 'file' : 'other';
      } catch (error) {
        if (fileErrorCode(error) === 'ENOENT') {
          return 'missing';
        }
        throw error;
      }
    },
    async rename(source, destination) {
      await rename(source, destination);
    },
    async unlink(path) {
      await unlink(path);
    },
    async list(directory) {
      return readdir(directory);
    },
  };
}

export const nodeFileOperations = createNodeFileOperations();

export function fileErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}
