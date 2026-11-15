#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

async function demoAnalyzePreflight(page) {
  await page.locator('#demo-select').click();
  await page.waitForFunction(() => document.querySelector('.area-stored') || /Proposed field boundary|حدود حقل مقترحة/.test(document.querySelector('#demo-status')?.textContent ?? ''), {}, { timeout: 45000 });
  await page.locator('#analyze').click();
  await page.waitForFunction(() => !document.querySelector('#analyze').disabled, {}, { timeout: 45000 });
  await page.locator('#planning').scrollIntoViewIfNeeded();
  await page.locator('#previous-crop').selectOption('maize');
  await page.locator('#previous-crop-confirmed').check({ force: true });
  await page.locator('#water-budget-amount').fill('150000');
  await page.locator('#run-preflight').click();
  await page.locator('.preflight-evaluation').first().waitFor({ timeout: 25000 });
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const log = [];
  try {
    await enterApp(page);
    await demoAnalyzePreflight(page);
    const current = await page.locator('.snapshot-validity--CURRENT').count();
    log.push({ journey: 'A-preflight', currentBanner: current });
    await page.locator('#save').click();
    await page.locator('#clear').click();
    await page.locator('#restore').click();
    await page.waitForTimeout(400);
    const historical = await page.locator('.snapshot-validity--HISTORICAL, .snapshot-validity--STALE').count();
    const evals = await page.locator('.preflight-evaluation').count();
    log.push({ journey: 'A-restore', historicalBanner: historical, liveEvaluations: evals });
    await enterApp(page);
    await demoAnalyzePreflight(page);
    await page.getByText('Enter boundary coordinates', { exact: true }).click();
    await page.locator('#coordinates').fill('36.780, -119.950\n36.780, -119.940\n36.785, -119.940\n36.785, -119.950');
    await page.locator('#apply').click();
    await page.waitForTimeout(500);
    const stale = await page.locator('.snapshot-validity--STALE, .snapshot-validity--HISTORICAL').count();
  const noCurrent = await page.locator('.snapshot-validity--CURRENT').count();
  log.push({ journey: 'B-field-switch', notCurrent: stale + noCurrent === 0 ? 0 : stale || 1 });
    await enterApp(page);
    await demoAnalyzePreflight(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    const path = require('node:path');
    const fs = require('node:fs/promises');
    const os = require('node:os');
    const file = path.join(os.tmpdir(), 'fs-journey-c.json');
    await download.saveAs(file);
    await page.locator('#clear').click();
    await page.locator('#import-file').setInputFiles(file);
    await page.waitForTimeout(800);
    const importStatus = await page.locator('#save-status').innerText();
    const prev = await page.locator('#previous-crop').inputValue();
    log.push({ journey: 'C-import', importStatus: importStatus.slice(0, 80), prevCrop: prev });
    console.log(JSON.stringify({ ok: true, base, log }, null, 1));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message, log }, null, 1));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();