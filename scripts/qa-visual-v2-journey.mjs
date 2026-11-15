#!/usr/bin/env node
/** Visual V2 functional journey: rail navigation, inspector, map controls, language switch, save/restore. Writes only under qa/visual-v2/. */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5173'}/`;
const outDir = 'qa/visual-v2/screenshots';
const log = { base, checks: [] };
const check = async (name, fn) => {
  try { log.checks.push({ name, result: 'pass', detail: (await fn()) ?? null }); }
  catch (e) { log.checks.push({ name, result: 'fail', error: String(e.message).slice(0, 300) }); }
};
const stages = (page) => page.evaluate(() => [...document.querySelectorAll('[data-workflow]')].map((el) => (el.getAttribute('aria-current') === 'step' ? 'current' : el.dataset.complete === 'true' ? 'done' : 'pending')).join(','));
const inView = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, sel);

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.cinematic-enter').first().click();
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#map-loading').waitFor({ state: 'hidden', timeout: 60000 });

    await check('rail-empty-state', async () => { const s = await stages(page); if (s !== 'current,pending,pending,pending') throw new Error(s); return s; });
    await check('search-coordinates', async () => {
      await page.locator('#search-input').fill('36.78, -119.95');
      await page.locator('#search-button').click();
      await page.waitForFunction(() => document.querySelector('#search-status').textContent.trim().length > 0, {}, { timeout: 10000 });
      const box = await page.locator('#search-status').boundingBox();
      if (!box) throw new Error('search status not visible');
      return await page.locator('#search-status').innerText();
    });
    await check('draw-controls-toggle', async () => {
      await page.locator('#draw').click();
      if (!(await page.locator('#finish').isVisible()) || !(await page.locator('#undo').isVisible())) throw new Error('finish/undo not shown while drawing');
      await page.locator('#clear').click();
      if (await page.locator('#finish').isVisible()) throw new Error('finish still shown after clear');
    });
    await check('demo-field-and-inspector', async () => {
      await page.locator('#demo-select').click();
      await page.waitForFunction(() => document.querySelector('.area-stored'), {}, { timeout: 45000 });
      const s = await stages(page);
      if (s !== 'done,current,pending,pending') throw new Error(s);
      const stored = await page.locator('.area-stored').innerText();
      const reconcile = await page.locator('.area-reconcile').count();
      const status = await page.locator('#demo-status').innerText();
      if (!/22\.220372/.test(stored) || !reconcile || !/Proposed field boundary/.test(status)) throw new Error('area provenance missing');
      return { area: await page.locator('.area-number').innerText(), stored, demoStatus: status };
    });
    await check('map-controls-work', async () => {
      const z0 = await page.evaluate(() => document.querySelector('.maplibregl-ctrl-scale')?.textContent);
      await page.locator('#zoom-out').click();
      await page.locator('#relief').click();
      const relief = await page.locator('#relief').getAttribute('aria-pressed');
      await page.locator('#satellite').click();
      await page.locator('#fit').click();
      await page.waitForTimeout(2500);
      if (relief !== 'true') throw new Error('relief toggle');
      return { scaleBefore: z0, reliefPressed: relief };
    });
    await check('analyze-advances-rail', async () => {
      await page.locator('#analyze').click();
      await page.waitForFunction(() => /NASA POWER/.test(document.querySelector('#nasa-content')?.textContent ?? '') && [...document.querySelectorAll('[data-workflow]')][2]?.getAttribute('aria-current') === 'step', {}, { timeout: 60000 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outDir}/desktop-1440x900-en-analyzed.png` });
      return await stages(page);
    });
    await check('rail-navigation-keeps-inputs', async () => {
      await page.locator('[data-rotation="0"][data-season="1"]').selectOption('soy');
      await page.locator('[data-workflow="3"]').click();
      await page.waitForTimeout(1200);
      if (!(await inView(page, '#preflight-root'))) throw new Error('Preflight not in view');
      await page.locator('#water-budget-amount').fill('622');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-workflow="2"]').click();
      await page.waitForTimeout(1200);
      if (!(await inView(page, '#planning'))) throw new Error('Planning not in view');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-workflow="1"]').click();
      await page.waitForTimeout(1200);
      if (!(await inView(page, '.environment'))) throw new Error('Analysis not in view');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-workflow="0"]').click();
      await page.waitForTimeout(1200);
      const crop = await page.locator('[data-rotation="0"][data-season="1"]').inputValue();
      const budget = await page.locator('#water-budget-amount').inputValue();
      if (crop !== 'soy' || budget !== '622') throw new Error('inputs lost: ' + crop + ' / ' + budget);
      return { crop, budget, area: await page.locator('.area-number').innerText() };
    });
    await check('keyboard-rail', async () => {
      await page.locator('[data-workflow="0"]').focus();
      await page.keyboard.press('Tab');
      const next = await page.evaluate(() => document.activeElement?.dataset?.workflow ?? null);
      if (next !== '1') throw new Error('tab order: ' + next);
      const labels = await page.evaluate(() => [...document.querySelectorAll('[data-workflow]')].map((el) => el.textContent.trim()));
      return labels;
    });
    await check('inspector-collapse-keeps-map-interactive', async () => {
      await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); window.__fsCanvas = document.querySelector('.maplibregl-canvas'); });
      await page.locator('#inspector-toggle').click();
      await page.waitForTimeout(600);
      const closed = await page.evaluate(() => ({ state: document.querySelector('#workspace').dataset.inspector, mapW: Math.round(document.querySelector('#map-shell').getBoundingClientRect().width), canvasW: Math.round(document.querySelector('.maplibregl-canvas').getBoundingClientRect().width) }));
      await page.locator('#zoom-in').click();
      await page.locator('#terrain').click();
      await page.waitForTimeout(3500);
      const terrain = await page.locator('#terrain').getAttribute('aria-pressed');
      await page.screenshot({ path: `${outDir}/desktop-1440x900-en-3d-inspector-collapsed.png` });
      await page.locator('#terrain').click();
      await page.waitForTimeout(1500);
      await page.locator('#inspector-open').click();
      await page.waitForTimeout(500);
      const open = await page.evaluate(() => ({ state: document.querySelector('#workspace').dataset.inspector, sameCanvas: window.__fsCanvas === document.querySelector('.maplibregl-canvas'), area: document.querySelector('.area-number')?.textContent }));
      if (closed.state !== 'closed' || closed.canvasW !== closed.mapW || open.state !== 'open' || !open.sameCanvas || !open.area) throw new Error(JSON.stringify({ closed, open }));
      return { closed, open, terrainPressedWhileCollapsed: terrain };
    });
    await check('language-switch-keeps-state', async () => {
      await page.locator('#language').click();
      await page.waitForTimeout(1500);
      const ar = await page.evaluate(() => ({ dir: document.documentElement.dir, sameCanvas: window.__fsCanvas === document.querySelector('.maplibregl-canvas'), area: document.querySelector('.area-number')?.textContent, crop: document.querySelector('[data-rotation="0"][data-season="1"]').value, stages: [...document.querySelectorAll('[data-workflow]')].map((el) => el.querySelector('span').textContent), wordmark: getComputedStyle(document.querySelector('.brand-wordmark')).direction, inspectorSide: document.querySelector('#inspector').getBoundingClientRect().left < document.querySelector('#map-shell').getBoundingClientRect().left ? 'left' : 'right' }));
      await page.locator('#language').click();
      await page.waitForTimeout(1200);
      if (ar.dir !== 'rtl' || !ar.sameCanvas || ar.crop !== 'soy' || ar.wordmark !== 'ltr' || ar.inspectorSide !== 'left') throw new Error(JSON.stringify(ar));
      return ar;
    });
    await check('save-clear-restore', async () => {
      await page.locator('#save').click();
      await page.locator('#clear').click();
      const cleared = await page.locator('.area-number').count();
      await page.locator('#restore').click();
      await page.locator('.area-number').waitFor({ timeout: 15000 });
      if (cleared !== 0) throw new Error('clear did not remove the field');
      return { area: await page.locator('.area-number').innerText() };
    });
    await check('no-page-errors', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  } finally {
    await writeFile('qa/visual-v2/journey-log.json', JSON.stringify(log, null, 2));
    await browser.close();
  }
  const failed = log.checks.filter((c) => c.result !== 'pass');
  console.log(JSON.stringify({ ok: !failed.length, checks: log.checks.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main();
