export interface FileStat {
  size: number;
  modifiedAt: number;
  fingerprint: string;
}

export interface FileStatProvider {
  stat(uri: string): Promise<FileStat>;
}

export function createNodeFileStatProvider(): FileStatProvider {
  return {
    async stat(uri) {
      const { stat } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const path = uri.toLowerCase().startsWith('file:')
        ? fileURLToPath(uri)
        : uri;
      const result = await stat(path);
      return {
        size: result.size,
        modifiedAt: result.mtimeMs,
        fingerprint: `${result.size}:${result.mtimeMs}`,
      };
    },
  };
}
