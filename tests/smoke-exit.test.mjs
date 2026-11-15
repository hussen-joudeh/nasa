import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smoke = path.join(root, 'scripts', 'smoke-live.mjs');

function runSmoke(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [smoke], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('smoke against unreachable backend exits 1 without libuv assertion', async () => {
  const { code, stderr } = await runSmoke({
    FIELDSHIFT_API_PORT: '59998',
    FIELDSHIFT_FRONTEND_PORT: '59997',
    PORT: '59998',
  });
  assert.equal(code, 1);
  assert.match(stderr, /FAILED|frontend_http|backend_health/);
  assert.doesNotMatch(stderr, /UV_HANDLE_CLOSING/);
});