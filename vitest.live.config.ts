import { defineConfig } from 'vitest/config';

// Live integration checks: run the real data clients against the real public services.
// Not part of `npm test` (network-dependent). Run with `npm run test:live`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.live.test.ts'],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
