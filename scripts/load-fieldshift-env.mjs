import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Load fieldshift.env into process.env (only keys not already set). See fieldshift.env.example. */
export function loadFieldshiftEnv(root = projectRoot) {
  const file = path.join(root, 'fieldshift.env');
  if (!existsSync(file)) return { loaded: false, path: file };
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return { loaded: true, path: file };
}