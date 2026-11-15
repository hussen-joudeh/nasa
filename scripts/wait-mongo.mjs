import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend');
const timeoutMs = Number(process.env.FIELDSHIFT_MONGO_WAIT_MS ?? 15000);
const started = Date.now();

async function tryPing() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/mongo-ping.mjs'], {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code === 0));
  });
}

while (Date.now() - started < timeoutMs) {
  if (await tryPing()) process.exit(0);
  await new Promise((r) => setTimeout(r, 500));
}
console.error(`MongoDB not ready after ${timeoutMs}ms. Run mongod or adjust MONGODB_URI.`);
process.exit(1);