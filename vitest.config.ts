import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**', '.output/**'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 85,
        lines: 85,
        branches: 75,
        functions: 75,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/types/**',
        'src/entrypoints/viewer/main.tsx',
        'src/entrypoints/background.ts',
      ],
    },
  },
});
