// Research helper: print N characters of context around each regex hit in a saved doc
// (useful for minified single-line HTML/JSON). Usage: node scripts/grep-context.mjs <docName> <regex> [chars] [maxHits]
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [name, pattern, chars = '300', maxHits = '6'] = process.argv.slice(2);
if (!name || !pattern || !/^[\w.-]+$/.test(name)) {
  console.error('usage: node scripts/grep-context.mjs <docName> <regex> [chars] [maxHits]');
  process.exit(2);
}
const raw = (await readFile(path.join(root, 'qa', 'source-probe', 'docs', name))).toString('utf8');
const keepScripts = process.argv.includes('--raw');
const text = (keepScripts ? raw : raw.replace(/<script[\s\S]*?<\/script>/gi, ' '))
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');
const re = new RegExp(pattern, 'gi');
const n = Number(chars);
let hits = 0;
let lastEnd = -1;
for (const m of text.matchAll(re)) {
  if (m.index < lastEnd) continue;
  const start = Math.max(0, m.index - n);
  const end = Math.min(text.length, m.index + m[0].length + n);
  console.log(`--- hit @${m.index}\n${text.slice(start, end)}\n`);
  lastEnd = end;
  hits += 1;
  if (hits >= Number(maxHits)) break;
}
if (!hits) console.log('no hits');
