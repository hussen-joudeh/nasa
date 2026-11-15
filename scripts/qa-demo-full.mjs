#!/usr/bin/env node
/**
 * Batch 08B.3 full demo journey — requires live MongoDB stack (5179 → 5178).
 * Does not modify MongoDB records (read-only API use).
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const shotDir = 'qa/screenshots/batch08b3';

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

const log = { startedAt: new Date().toISOString(), base, checks: [], screenshots: [] };
const check = async (name, fn) => {
  try {
    await fn();
    log.checks.push({ name, result: 'pass' });
  } catch (e) {
    log.checks.push({ name, result: 'fail', error: e.message });
  }
};

async function demoFieldLoaded(page) {
  await page.locator('#demo-select').click();
  await page.waitForFunction(
    () => document.querySelector('.area-stored') || /Proposed field boundary|حدود حقل مقترحة|source record|السجل المصدر/.test(document.querySelector('#demo-status')?.textContent ?? ''),
    {},
    { timeout: 45000 },
  );
}

async function analyzeClimate(page) {
  await page.locator('#analyze').click();
  await page.waitForFunction(() => !document.querySelector('#analyze')?.disabled, {}, { timeout: 60000 });
  await page.locator('#nasa-content .nasa-head, #nasa-content .provenance').first().waitFor({ timeout: 60000 });
}

async function runPreflight(page, { budget = '' } = {}) {
  await page.locator('#planning').scrollIntoViewIfNeeded();
  if (budget !== '') await page.locator('#water-budget-amount').fill(budget);
  await page.locator('#run-preflight').click();
  await page.locator('.preflight-evaluation').first().waitFor({ timeout: 30000 });
}

async function main() {
  await mkdir(shotDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await check('01-cinematic-enter', async () => {
      await enterApp(desktop);
    });
    await check('02-maplibre-workspace', async () => {
      if (!(await desktop.locator('#map').count())) throw new Error('Map missing');
    });
    await check('03-demo-field-select', demoFieldLoaded.bind(null, desktop));
    await check('04-boundary-area-labels', async () => {
      const text = await desktop.locator('#demo-status').innerText();
      if (!/stored|السجل|calculated|محسوبة/i.test(text)) throw new Error('Missing dual area labels: ' + text.slice(0, 120));
      const area = await desktop.locator('.area-stored, .area-reconcile').count();
      if (!area) throw new Error('Missing stored vs calculated area UI');
    });
    await check('05-climate-analyze', analyzeClimate.bind(null, desktop));
    await check('06-mongodb-climate-source', async () => {
      const body = await desktop.locator('#nasa-content').innerText();
      if (!/MongoDB|Archived NASA|2025|NASA POWER/i.test(body)) throw new Error('Climate source not visible');
    });
    await check('07-rotation-edits', async () => {
      await desktop.locator('[data-rotation="0"][data-season="1"]').selectOption('soy');
      await desktop.locator('[data-rotation="1"][data-season="2"]').selectOption('chickpea');
      await desktop.locator('[data-rotation="2"][data-season="0"]').selectOption('sunflower');
    });
    await check('08-preflight-unknown-budget', async () => {
      await pageClearBudget(desktop);
      await desktop.screenshot({ path: path.join(shotDir, 'preflight-missing-budget.png'), fullPage: true });
      await runPreflight(desktop, { budget: '' });
      const unk = await desktop.locator('.preflight-evaluation [data-status="UNKNOWN"]').count();
      if (!unk) throw new Error('Expected UNKNOWN checks with empty budget');
    });
    await check('09-farmer-budget-re-eval', async () => {
      await pageClearBudget(desktop);
      await desktop.locator('#water-budget-amount').fill('120000');
      await desktop.locator('#run-preflight').click();
      await desktop.locator('.preflight-evaluation [data-status="PASS"], .preflight-evaluation [data-status="WARNING"]').first().waitFor({ timeout: 20000 });
    });
    await check('10-farmer-previous-crop-impact', async () => {
      await desktop.locator('#previous-crop').selectOption('maize');
      await desktop.locator('#previous-crop-confirmed').check({ force: true });
      await runPreflight(desktop, { budget: '120000' });
      const impact = await desktop.locator('.farmer-input-impact, #farmer-input-impact').innerText();
      if (!/history|السابق|rotation/i.test(impact)) throw new Error('No farmer impact visible');
    });
    await check('11-decision-trace-provenance', async () => {
      await desktop.locator('.trace-check[data-rule="water.field-area"] summary').first().click();
      const prov = await desktop.locator('.trace-check[data-rule="water.field-area"]').first().innerText();
      if (/stored_daily|evaluateRotation|domain\.mjs|rotation\.history/i.test(prov)) throw new Error('Raw debug in trace');
      if (!/boundary geometry|Proposed boundary|حدود الحقل المقترحة/i.test(prov)) throw new Error('Missing geometry provenance label');
    });
    await check('12-save-export-import', async () => {
      await desktop.locator('#save').click();
      const [download] = await Promise.all([desktop.waitForEvent('download'), desktop.locator('#export').click()]);
      const tmp = path.join(shotDir, 'plan-roundtrip.json');
      await download.saveAs(tmp);
      await desktop.locator('#clear').click();
      await desktop.locator('#import-file').setInputFiles(tmp);
      await desktop.waitForTimeout(600);
      const crop = await desktop.locator('[data-rotation="0"][data-season="0"]').inputValue();
      if (!crop) throw new Error('Rotation not restored in UI');
      const budget = await desktop.locator('#water-budget-amount').inputValue();
      if (budget !== '120000') throw new Error('Budget not restored: ' + budget);
    });
    await check('13-breakpoint-spring-demo', async () => {
      await analyzeClimate(desktop);
      await desktop.locator('#decision-breakpoint-demo').click();
      await desktop.waitForFunction(() => /^2025-0[45]/.test(document.querySelector('#planting-date-1')?.value ?? ''), {}, { timeout: 15000 });
      const d1 = await desktop.locator('#planting-date-1').inputValue();
      if (d1.startsWith('2025-01-01')) throw new Error('January planting still set');
    });
    await desktop.screenshot({ path: path.join(shotDir, 'water-truth-spring-calendar.png'), fullPage: true });
    await desktop.screenshot({ path: path.join(shotDir, 'desktop-analysis-complete.png'), fullPage: true });
    log.screenshots.push('desktop-analysis-complete.png');
    await desktop.screenshot({ path: path.join(shotDir, 'rotation-comparison.png'), fullPage: true, clip: { x: 0, y: 400, width: 1440, height: 700 } });
    await check('14-historical-snapshot-banner', async () => {
      await desktop.locator('#planning').scrollIntoViewIfNeeded();
      await desktop.waitForFunction(
        () =>
          document.querySelector('.snapshot-validity--HISTORICAL, .snapshot-validity--STALE') ||
          /historical|أرشيف|STALE/i.test(document.querySelector('#save-status')?.textContent ?? ''),
        {},
        { timeout: 15000 },
      );
      await desktop.screenshot({ path: path.join(shotDir, 'import-historical-warning.png'), fullPage: true });
    });
    await check('15-reanalyze-current', async () => {
      await analyzeClimate(desktop);
      await runPreflight(desktop, { budget: '120000' });
      const current = await desktop.locator('.snapshot-validity--CURRENT').count();
      if (!current) throw new Error('Expected CURRENT after re-run');
    });
    await check('16-field-switch-no-leakage', async () => {
      await desktop.getByText('Enter boundary coordinates', { exact: true }).click();
      await desktop.locator('#coordinates').fill('36.780, -119.950\n36.780, -119.940\n36.785, -119.940\n36.785, -119.950');
      await desktop.locator('#apply').click();
      await desktop.waitForTimeout(400);
      const stale = await desktop.locator('.snapshot-validity--STALE, .snapshot-validity--HISTORICAL').count();
      if (!stale) throw new Error('Expected invalidation on field change');
    });
    await desktop.screenshot({ path: path.join(shotDir, 'decision-trace-provenance.png'), fullPage: true });
    await desktop.screenshot({ path: path.join(shotDir, 'preflight-before-after-budget.png'), fullPage: true });

    await check('17-arabic-rtl-subset', async () => {
      await enterApp(mobile);
      await demoFieldLoaded(mobile);
      await mobile.locator('#language').click();
      const dir = await mobile.locator('html').getAttribute('dir');
      if (dir !== 'rtl') throw new Error('RTL not set');
      if (await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) {
        throw new Error('Mobile horizontal overflow');
      }
      await mobile.screenshot({ path: path.join(shotDir, 'arabic-decision-panel.png'), fullPage: true });
      await mobile.screenshot({ path: path.join(shotDir, 'mobile-result.png'), fullPage: true });
    });

    await writeFile('qa/demo-full-results.json', JSON.stringify(log, null, 2));
    const failed = log.checks.filter((c) => c.result === 'fail');
    console.log(JSON.stringify({ ok: failed.length === 0, passed: log.checks.length - failed.length, failed: failed.length, base }, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

async function pageClearBudget(page) {
  await page.locator('#water-budget-amount').fill('');
}

main();