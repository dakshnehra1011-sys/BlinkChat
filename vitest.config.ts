import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**/*.ts',
        'packages/database/src/**/*.ts',
        'apps/worker/src/utils/crypto.ts',
        'apps/worker/src/durable-objects/**/*.ts',
      ],
      exclude: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 90,
        functions: 90,
      },
    },
  },
});
