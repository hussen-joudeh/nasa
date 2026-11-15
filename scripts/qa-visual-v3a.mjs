#!/usr/bin/env node
/** Visual V3A — Decision Breakpoint threshold screenshots (09C scenario). */
import { chromium } from 'playwright-core';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const outDir = 'qa/visual-v3a/screenshots';
const proof = JSON.parse(await readFile('qa/breakpoint-proof-09c.json', 'utf8'));

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
}

async function setMobileView(page, view) {
  const tab = page.locator(`[data-view="${view}"]`);
  if (await tab.isVisible().catch(() => false)) await tab.click();
}

async function ensurePlanPanel(page) {
  await setMobileView(page, 'plan');
  await page.locator('#planning').scrollIntoViewIfNeeded();
}

async function ensurePreflightPanel(page) {
  await setMobileView(page, 'decision');
  await page.locator('#preflight-root').scrollIntoViewIfNeeded();
}

async function setup09c(page) {
  await page.locator('#demo-select').click();
  await page.waitForFunction(() => document.querySelector('.area-stored'), {}, { timeout: 45000 });
  await page.locator('#analyze').click();
  await page.waitForFunction(() => document.querySelector('#nasa-content .nasa-head'), {}, { timeout: 90000 });
  await ensurePlanPanel(page);
  await page.locator('[data-rotation="0"][data-season="1"]').selectOption('soy');
  await ensurePreflightPanel(page);
  await page.locator('#planting-date-1').fill('2025-04-20');
  await page.locator('#planting-date-2').fill('2025-05-01');
  await page.locator('#planting-date-3').fill('2025-05-15');
  await page.locator('#illustrative-crop-settings').evaluate((el) => {
    if (!el.checked) el.click();
  });
  await page.locator('#effective-rainfall-slope-confirmed').evaluate((el) => {
    if (!el.checked) el.click();
  });
  await ensurePreflightPanel(page);
  await page.locator('#run-preflight').click();
  await page.locator('.decision-breakpoint').waitFor({ state: 'attached', timeout: 60000 });
  await page.locator('.breakpoint-axis-track').first().waitFor({ timeout: 60000 });
}

async function runBudget(page, mm) {
  await ensurePreflightPanel(page);
  await page.locator('#water-budget-unit').selectOption('mm');
  await page.locator('#water-budget-period').selectOption('perSeason');
  await page.locator('#water-budget-amount').fill(String(mm));
  await page.locator('#run-preflight').click();
  await page.locator('.breakpoint-axis-track').first().waitFor({ timeout: 30000 });
}

async function shot(page, name) {
  await ensurePreflightPanel(page);
  await page.locator('.decision-breakpoint').screenshot({ path: `${outDir}/${name}.png` });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir('qa/visual-v3a/before', { recursive: true });
  try {
    await copyFile('qa/visual-v2/screenshots/desktop-1440x900-en-analyzed.png', 'qa/visual-v3a/before/v2-preflight-context.png');
  } catch {}

  const log = { base, captures: [] };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await enterApp(desktop);
    await setup09c(desktop);
    await runBudget(desktop, proof.demoScriptBudgetMm.below);
    await shot(desktop, 'desktop-1440-below-threshold-warning');
    log.captures.push('desktop-1440-below-threshold-warning');
    await runBudget(desktop, proof.demoScriptBudgetMm.at);
    await shot(desktop, 'desktop-1440-at-threshold-pass');
    log.captures.push('desktop-1440-at-threshold-pass');
    await shot(desktop, 'desktop-1440-overall-unknown-hierarchy');
    log.captures.push('desktop-1440-overall-unknown-hierarchy');
    await desktop.setViewportSize({ width: 1600, height: 1000 });
    await shot(desktop, 'desktop-1600-comparison');
    log.captures.push('desktop-1600-comparison');

    const tablet = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await enterApp(tablet);
    await setup09c(tablet);
    await runBudget(tablet, 622);
    await shot(tablet, 'tablet-768-below');
    log.captures.push('tablet-768-below');

    const mobileEn = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await enterApp(mobileEn);
    await setup09c(mobileEn);
    await runBudget(mobileEn, 622);
    await shot(mobileEn, 'mobile-375-en-below');
    log.captures.push('mobile-375-en-below');

    const mobileAr = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await enterApp(mobileAr);
    await mobileAr.locator('#language').click();
    await setup09c(mobileAr);
    await runBudget(mobileAr, 622);
    await shot(mobileAr, 'mobile-375-ar-rtl');
    log.captures.push('mobile-375-ar-rtl');

    const empty = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await enterApp(empty);
    await ensurePreflightPanel(empty);
    await empty.locator('.decision-breakpoint').screenshot({ path: `${outDir}/desktop-insufficient-evidence-empty.png` });
    log.captures.push('desktop-insufficient-evidence-empty');
  } finally {
    await browser.close();
  }
  await writeFile('qa/visual-v3a/capture-log.json', JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ ok: true, captures: log.captures.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});