import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('vite configuration module loads with supported loadEnv import', async () => {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    path.join(root, 'vite.config.ts'),
    root,
  );
  assert.ok(loaded?.config);
  const resolved = typeof loaded.config === 'function' ? loaded.config({ mode: 'test' }) : loaded.config;
  assert.ok(resolved.server?.proxy?.['/api']);
  assert.equal(resolved.test?.environment, 'jsdom');
});