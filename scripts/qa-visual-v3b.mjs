#!/usr/bin/env node
/** Visual V3B — Preflight hierarchy screenshots (09C scenario). */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const outDir = 'qa/visual-v3b/screenshots';

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
  await page.locator('#water-budget-unit').selectOption('mm');
  await page.locator('#water-budget-period').selectOption('perSeason');
  await page.locator('#water-budget-amount').fill('622');
  await page.locator('#run-preflight').click();
  await page.locator('.preflight-results-hub').waitFor({ state: 'visible', timeout: 60000 });
}

async function measureHub(page) {
  return page.evaluate(() => {
    const hub = document.querySelector('.preflight-results-hub');
    const panel = document.querySelector('.preflight-panel');
    const rect = (el) => (el ? { height: el.getBoundingClientRect().height, scrollHeight: el.scrollHeight } : null);
    return { hub: rect(hub), panel: rect(panel), viewport: { w: innerWidth, h: innerHeight } };
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir('qa/visual-v3b/baseline', { recursive: true });
  const log = { base, captures: [], metrics: [] };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await enterApp(desktop);
    await setup09c(desktop);
    log.metrics.push({ label: 'desktop-1440-after', ...(await measureHub(desktop)) });
    await desktop.locator('.preflight-rotation-strip').screenshot({ path: `${outDir}/desktop-1440-rotation-compare.png` });
    log.captures.push('desktop-1440-rotation-compare');
    await desktop.locator('.preflight-overview').first().screenshot({ path: `${outDir}/desktop-1440-preflight-overview.png` });
    log.captures.push('desktop-1440-preflight-overview');
    await desktop.locator('.preflight-breakpoint-anchor').screenshot({ path: `${outDir}/desktop-1440-breakpoint-anchor.png` });
    log.captures.push('desktop-1440-breakpoint-anchor');
    await desktop.locator('#preflight-check-groups-0 details.preflight-check-group[data-group="unknown"]').evaluate((el) => {
      el.open = true;
    });
    await desktop.locator('#preflight-check-groups-0').screenshot({ path: `${outDir}/desktop-1440-unknown-expanded.png` });
    log.captures.push('desktop-1440-unknown-expanded');
    await desktop.locator('.preflight-check-pick').first().click();
    await desktop.locator('#preflight-provenance-drawer').waitFor({ state: 'visible' });
    await desktop.locator('#preflight-provenance-drawer').screenshot({ path: `${outDir}/desktop-1440-provenance-drawer.png` });
    log.captures.push('desktop-1440-provenance-drawer');
    await desktop.locator('#preflight-tab-1').click();
    await desktop.locator('.preflight-rotation-strip').screenshot({ path: `${outDir}/desktop-1440-rotation-b-selected.png` });
    log.captures.push('desktop-1440-rotation-b-selected');
    await desktop.locator('#water-budget-amount').fill('621');
    await desktop.locator('.preflight-stale').waitFor({ state: 'visible', timeout: 15000 });
    await desktop.locator('#preflight-results').screenshot({ path: `${outDir}/desktop-1440-stale-results.png` });
    log.captures.push('desktop-1440-stale-results');

    const wide = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await enterApp(wide);
    await setup09c(wide);
    log.metrics.push({ label: 'desktop-1600-after', ...(await measureHub(wide)) });
    await wide.locator('#preflight-results').screenshot({ path: `${outDir}/desktop-1600-preflight-hub.png` });
    log.captures.push('desktop-1600-preflight-hub');

    const tablet = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await enterApp(tablet);
    await setup09c(tablet);
    await tablet.locator('#preflight-results').screenshot({ path: `${outDir}/tablet-768-preflight-hub.png` });
    log.captures.push('tablet-768-preflight-hub');

    const mobileEn = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await enterApp(mobileEn);
    await setup09c(mobileEn);
    await mobileEn.locator('#preflight-results').screenshot({ path: `${outDir}/mobile-375-en-preflight-hub.png` });
    log.captures.push('mobile-375-en-preflight-hub');

    const mobileAr = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await enterApp(mobileAr);
    await mobileAr.locator('#language').click();
    await setup09c(mobileAr);
    await mobileAr.locator('#preflight-results').screenshot({ path: `${outDir}/mobile-375-ar-rtl-preflight-hub.png` });
    log.captures.push('mobile-375-ar-rtl-preflight-hub');
  } finally {
    await browser.close();
  }
  await writeFile('qa/visual-v3b/capture-log.json', JSON.stringify(log, null, 2));
  await writeFile(
    'qa/visual-v3b/density-note.md',
    `Density metrics are viewport-relative bounding boxes for \`.preflight-results-hub\` and \`.preflight-panel\` after V3B.\nCompare to pre-V3B baseline in git history (\`src/preflight-view.mjs\` before hub layout).\n${JSON.stringify(log.metrics, null, 2)}`,
  );
  console.log(JSON.stringify({ ok: true, captures: log.captures.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});