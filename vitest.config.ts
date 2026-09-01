import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    exclude: [
      'test/extension/suite/activation.test.ts',
      'test/extension/suite/bookImportRead.test.ts',
      'test/extension/suite/multiWindow.test.ts',
      'test/extension/suite/sidebar.test.ts',
    ],
  },
});
