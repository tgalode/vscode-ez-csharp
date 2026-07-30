import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The integration suite needs a real extension host; it runs through vscode-test.
    exclude: ['node_modules/**', 'tests/integration/**', 'tests/integration-csharp/**', 'tests/integration-multiroot/**'],
    environment: 'node',
  },
});
