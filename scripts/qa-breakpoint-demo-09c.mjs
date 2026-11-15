#!/usr/bin/env node
/** Browser proof of Batch 09C Decision Breakpoint scenario (live stack). */
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const proof = JSON.parse(await readFile('qa/breakpoint-proof-09c.json', 'utf8'));

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

const log = { checks: [] };
const check = async (name, fn) => {
  try {
    await fn();
    log.checks.push({ name, result: 'pass' });
  } catch (e) {
    log.checks.push({ name, result: 'fail', error: e.message });
  }
};

async function setupField(page) {
  await page.locator('#demo-select').click();
  await page.waitForFunction(() => document.querySelector('.area-stored'), {}, { timeout: 45000 });
  await page.locator('#analyze').click();
  await page.waitForFunction(() => document.querySelector('#nasa-content .nasa-head'), {}, { timeout: 90000 });
}

async function configurePlan(page) {
  await page.locator('[data-rotation="0"][data-season="1"]').selectOption('soy');
  await page.locator('#planting-date-1').fill('2025-04-20');
  await page.locator('#planting-date-2').fill('2025-05-01');
  await page.locator('#planting-date-3').fill('2025-05-15');
  await page.locator('#illustrative-crop-settings').check({ force: true });
  await page.locator('#effective-rainfall-slope-confirmed').check({ force: true });
}

async function runPreflightWithBudget(page, mm) {
  await page.locator('#planning').scrollIntoViewIfNeeded();
  await page.locator('#water-budget-unit').selectOption('mm');
  await page.locator('#water-budget-period').selectOption('perSeason');
  await page.locator('#water-budget-amount').fill(String(mm));
  await page.locator('#run-preflight').click();
  await page.locator('.preflight-evaluation').first().waitFor({ timeout: 30000 });
}

async function rotationAWaterBalanceSeason1(page) {
  const store = page.locator('.preflight-check-store[data-rotation="0"][data-check-key="water.balance:1"]');
  await store.waitFor({ state: 'attached', timeout: 15000 });
  return store.locator('.preflight-status').first().getAttribute('data-status');
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await enterApp(page);
    await check('demo-analyze', () => setupField(page));
    await check('rotation-a-wheat-soy-wheat', () => configurePlan(page));
    await check('below-threshold-warning', async () => {
      await runPreflightWithBudget(page, 622);
      const card = page.locator('.preflight-seasons .preflight-season').first();
      const text = await card.innerText();
      if (!/WARNING|تحذير/i.test(text)) throw new Error('Expected WARNING in season 1 card: ' + text.slice(0, 80));
    });
    await check('at-threshold-pass', async () => {
      await runPreflightWithBudget(page, proof.demoScriptBudgetMm.at);
      const overall = await page.locator('.preflight-overview .preflight-status').first().getAttribute('data-status');
      if (overall === 'PASS') throw new Error('Overall must not imply full plan approval');
      const balance = await rotationAWaterBalanceSeason1(page);
      if (balance !== 'PASS') throw new Error('Expected water.balance season 1 PASS, got ' + balance);
    });
    await check('above-threshold-pass', async () => {
      await runPreflightWithBudget(page, proof.demoScriptBudgetMm.above);
      const balance = await rotationAWaterBalanceSeason1(page);
      if (balance !== 'PASS') throw new Error('Expected water.balance season 1 PASS above threshold, got ' + balance);
    });
    await check('breakpoint-card', async () => {
      await page.locator('#decision-breakpoint-demo').click();
      await page.waitForTimeout(800);
      await runPreflightWithBudget(page, 622);
      const bp = await page.locator('.breakpoint-finding').first().innerText().catch(() => '');
      if (!/Decision-sensitive|يتأثر|water/i.test(bp) && !bp) {
        await page.locator('#run-preflight').click();
        await page.waitForTimeout(500);
      }
      const text = await page.locator('.decision-breakpoint').innerText();
      if (!/water|مياه|budget|ميزانية/i.test(text)) throw new Error('Breakpoint panel missing water finding');
    });
    await check('unknown-checks-remain', async () => {
      const unknown = await page.locator('[data-status="UNKNOWN"]').count();
      if (unknown < 3) throw new Error('Expected multiple UNKNOWN checks, got ' + unknown);
    });
    await writeFile('qa/breakpoint-demo-09c-browser.json', JSON.stringify({ ...log, proofThresholdMm: proof.threshold.mm }, null, 2));
    console.log(JSON.stringify({ ok: !log.checks.some((c) => c.result === 'fail'), checks: log.checks }, null, 2));
    if (log.checks.some((c) => c.result === 'fail')) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();