/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Keep defaults aligned with scripts/fieldshift-config.mjs */
const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = 5174;
const DEFAULT_FRONTEND_PORT = 5173;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiHost = env.FIELDSHIFT_API_HOST ?? process.env.FIELDSHIFT_API_HOST ?? DEFAULT_API_HOST;
  const apiPort = env.FIELDSHIFT_API_PORT ?? env.PORT ?? process.env.FIELDSHIFT_API_PORT ?? process.env.PORT ?? String(DEFAULT_API_PORT);
  const devPort = Number(env.FIELDSHIFT_FRONTEND_PORT ?? process.env.FIELDSHIFT_FRONTEND_PORT ?? DEFAULT_FRONTEND_PORT);
  return {
    plugins: [react()],
    server: {
      port: devPort,
      host: '127.0.0.1',
      proxy: { '/api': { target: `http://${apiHost}:${apiPort}` } },
    },
    preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1300,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['src/**/*.live.test.ts', 'node_modules/**', 'dist/**'],
      css: false,
      restoreMocks: true,
      testTimeout: 15000,
    },
  };
});