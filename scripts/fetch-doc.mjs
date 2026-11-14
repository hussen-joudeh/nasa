// Research helper: download a documentation page / API response into qa/source-probe/docs/
// so the exact text can be read and cited. Treats everything as inert data.
// Usage: node scripts/fetch-doc.mjs <url> <outName> [--origin] [--post=<json>] [--range=a-b] [--text] [--quiet]
//   --text   additionally writes <outName>.txt with HTML tags stripped (one block per line)
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'qa', 'source-probe', 'docs');
const [url, outName, ...flags] = process.argv.slice(2);
if (!url || !outName) {
  console.error('usage: node scripts/fetch-doc.mjs <url> <outName> [--origin] [--post=<json>] [--range=a-b] [--text] [--quiet]');
  process.exit(2);
}
if (!/^[\w.-]+$/.test(outName)) {
  console.error('outName must be a plain file name');
  process.exit(2);
}
const headers = { 'User-Agent': 'field-shift-local-dev-probe/0.1' };
if (flags.includes('--origin')) headers.Origin = 'http://localhost:5173';
const range = flags.find((f) => f.startsWith('--range='));
if (range) headers.Range = `bytes=${range.slice('--range='.length)}`;
const post = flags.find((f) => f.startsWith('--post='));
const init = { headers, signal: AbortSignal.timeout(120000) };
if (post) {
  init.method = 'POST';
  init.body = post.slice('--post='.length);
  headers['Content-Type'] = 'application/json';
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol|section|article|header|footer|pre|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .split('\n')
    .map((l) => l.replace(/[ \t\r]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const t0 = Date.now();
try {
  const res = await fetch(url, init);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, outName), buf);
  const info = {
    status: res.status,
    ms: Date.now() - t0,
    bytes: buf.length,
    type: res.headers.get('content-type'),
    acao: res.headers.get('access-control-allow-origin'),
    contentRange: res.headers.get('content-range'),
    out: path.join('qa', 'source-probe', 'docs', outName),
  };
  if (flags.includes('--text')) {
    const enc = /charset=iso-8859-1/i.test(info.type ?? '') || /charset=iso-8859-1/i.test(buf.subarray(0, 600).toString('latin1')) ? 'latin1' : 'utf8';
    const text = htmlToText(buf.toString(enc));
    await writeFile(path.join(outDir, `${outName}.txt`), text, 'utf8');
    info.textLines = text.split('\n').length;
  }
  console.log(JSON.stringify(info));
  if (!flags.includes('--quiet')) console.log(buf.toString('utf8').slice(0, 1500));
} catch (e) {
  console.log('ERROR', e.name, e.message, e.cause?.code ?? '');
  process.exitCode = 1;
}
