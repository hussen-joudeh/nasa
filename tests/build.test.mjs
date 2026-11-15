import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, copyFile, cp, mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputs = [
  'src/assets/cinematic-farmland.webp', 'index.html', 'sources.html', 'scripts/build-local.mjs',
  'src/evidence-readiness.mjs','src/evidence-view.mjs','src/demo-evidence.mjs','src/farmer-inputs.mjs','src/farmer-input-view.mjs','src/decision-trace.mjs','src/decision-snapshot.mjs','src/decision-snapshot-validity.mjs','src/decision-trace-view.mjs','src/app.mjs', 'src/domain.mjs', 'src/i18n.mjs', 'src/nasa-power.mjs',
  'src/water-truth.mjs', 'src/preflight.mjs', 'src/display-format.mjs', 'src/preflight-view.mjs', 'src/preflight-ui.mjs', 'src/breakpoint-viz.mjs', 'src/decision-breakpoint.mjs', 'src/biofirewall.mjs', 'src/biofirewall-view.mjs', 'src/rotation-view.mjs', 'src/map-explorer.mjs', 'src/style.css', 'src/brand-tokens.css', 'site.webmanifest', 'brand-tokens.json',
];

test('local build includes every runtime module imported by the app', async () => {
  const tempBase = process.env.TMPDIR || process.env.TEMP || tmpdir();
  const root = await mkdtemp(path.join(tempBase, 'field-shift-build-'));
  try {
    for (const file of inputs) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(projectRoot, file), target);
    }
    await cp(path.join(projectRoot, 'src/assets/brand'), path.join(root, 'src/assets/brand'), {recursive: true});
    execFileSync(process.execPath, [path.join(root, 'scripts', 'build-local.mjs')], {
      cwd: root,
      encoding: 'utf8',
    });
    const app = await readFile(path.join(root, 'src', 'app.mjs'), 'utf8');
    const imports = [...app.matchAll(/from\s+['"]\.\/([^'"]+\.mjs)['"]/g)].map(([, name]) => name);
    await assert.doesNotReject(access(path.join(root,'dist','src','assets','cinematic-farmland.webp')));
    assert.ok(imports.length > 0, 'app should have local runtime imports');
    for (const name of imports) {
      await assert.doesNotReject(access(path.join(root, 'dist', 'src', name)), `missing built module: ${name}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
