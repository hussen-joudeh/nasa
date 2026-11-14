// Research helper: flattens every <table> of a saved HTML doc into "cell ; cell ; cell" lines
// so reference tables (e.g. FAO-56 Tables 11/12) can be read and cited exactly.
// Usage: node scripts/extract-html-tables.mjs <docName.html> [encoding]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'qa', 'source-probe', 'docs');
const [name, encoding = 'latin1'] = process.argv.slice(2);
if (!name || !/^[\w.-]+$/.test(name)) {
  console.error('usage: node scripts/extract-html-tables.mjs <docName.html> [encoding]');
  process.exit(2);
}
const html = (await readFile(path.join(docs, name))).toString(encoding);
const clean = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
const out = [];
let ti = 0;
for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
  ti += 1;
  const before = clean(html.slice(Math.max(0, t.index - 400), t.index)).slice(-160);
  out.push(`\n##### TABLE BLOCK ${ti} (preceded by: …${before})`);
  for (const r of t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => clean(c[1]));
    if (cells.some(Boolean)) out.push(cells.join(' ; '));
  }
}
const outFile = path.join(docs, `${name}.tables.txt`);
await writeFile(outFile, out.join('\n'), 'utf8');
console.log(`tables=${ti} lines=${out.length} -> ${path.relative(root, outFile)}`);
