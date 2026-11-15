#!/usr/bin/env node
/**
 * Browser check: export then import the same plan (requires aligned frontend).
 */
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(path.resolve('package.json'));
const { chromium } = require('playwright-core');

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;

const polygon = '36.780, -119.950\n36.780, -119.940\n36.785, -119.940\n36.785, -119.950';

async function main() {
  const outDir = await mkdtemp(path.join(tmpdir(), 'fs-import-'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.cinematic-enter').first().click();
    await page.locator('#workspace').waitFor({ state: 'visible' });
    await page.getByText('Enter boundary coordinates', { exact: true }).click();
    await page.locator('#coordinates').fill(polygon);
    await page.locator('#apply').click();
    await page.locator('.area-number').waitFor();
    await page.locator('#analyze').click();
    await page.waitForFunction(() => !document.querySelector('#analyze').disabled, {}, { timeout: 60000 });
    await page.locator('#previous-crop').selectOption('maize');
    await page.locator('#previous-crop-confirmed').check();
    await page.locator('#water-budget-amount').fill('150000');
    await page.locator('#run-preflight').click();
    await page.locator('.preflight-evaluation').first().waitFor({ timeout: 25000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    const exportPath = path.join(outDir, 'roundtrip.json');
    await download.saveAs(exportPath);
    const bytes = Buffer.byteLength(await readFile(exportPath));
    if (bytes <= 100_000) throw new Error(`expected export >100 KB, got ${bytes}`);
    await page.locator('#import-file').setInputFiles(exportPath);
    await page.waitForTimeout(800);
    const status = await page.locator('#save-status').innerText();
    if (status.includes('too large') || status.includes('Unable') || status.includes('تعذّرت')) {
      throw new Error(`import failed: ${status}`);
    }
    const prev = await page.locator('#previous-crop').inputValue();
    const confirmed = await page.locator('#previous-crop-confirmed').isChecked();
    const budget = await page.locator('#water-budget-amount').inputValue();
    if (prev !== 'maize' || !confirmed || budget !== '150000') {
      throw new Error(`restored mismatch prev=${prev} confirmed=${confirmed} budget=${budget}`);
    }
    await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ ok: true, bytes, status, base }, null, 2));
    console.log(`Import/export round trip PASS (${bytes} bytes) @ ${base}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Import/export QA FAILED:', err.message);
  process.exitCode = 1;
});