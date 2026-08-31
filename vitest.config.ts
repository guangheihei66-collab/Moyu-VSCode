import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    exclude: [
      'test/extension/suite/activation.test.ts',
      'test/extension/suite/restartRecovery.test.ts',
      'test/extension/suite/multiWindow.test.ts',
    ],
  },
});
