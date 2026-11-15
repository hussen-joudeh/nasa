#!/usr/bin/env node
/** Visual V2 workspace capture + layout checks. Needs the live stack. Writes only under qa/visual-v2/. */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5173'}/`;
const outDir = process.env.FIELDSHIFT_V2_OUT ?? 'qa/visual-v2/screenshots';
const shots = [
  { name: 'desktop-1440x900-en', width: 1440, height: 900, lang: 'en' },
  { name: 'desktop-1600x1000-en', width: 1600, height: 1000, lang: 'en' },
  { name: 'tablet-768x1024-en', width: 768, height: 1024, lang: 'en' },
  { name: 'mobile-375x812-en', width: 375, height: 812, lang: 'en' },
  { name: 'mobile-375x812-ar', width: 375, height: 812, lang: 'ar' },
  { name: 'desktop-1440x900-ar', width: 1440, height: 900, lang: 'ar' },
];

// Geometry facts read from the live DOM: overlaps between map controls, overflow, map share of the console.
const measure = () => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
  };
  const hit = (a, b) => !!(a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  const parts = { layers: box('.stage-layers'), tools: box('.stage-tools'), draw: box('.stage-draw'), next: box('#next-step'), open: box('#inspector-open'), tag: box('.field-tag') };
  const names = Object.keys(parts);
  const overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(parts[names[i]], parts[names[j]])) overlaps.push(names[i] + ' x ' + names[j]);
  const map = box('#map-shell');
  const inspector = box('#inspector');
  const shell = box('#workspace');
  const small = [...document.querySelectorAll('#workspace button')]
    .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); })
    .map((b) => b.id || b.textContent.trim().slice(0, 16));
  const nav = document.getElementById('mobile-views');
  const navBox = nav?.getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight],
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    map,
    inspector,
    mapShareOfConsole: map && shell ? +((map.w * map.h) / (shell.w * shell.h)).toFixed(3) : null,
    mapShareOfViewport: map ? +((map.w * Math.min(map.h, innerHeight - Math.max(0, map.y))) / (innerWidth * innerHeight)).toFixed(3) : null,
    inspectorOverMap: hit(map, inspector),
    controlOverlaps: overlaps,
    controlsUnder44px: small,
    stage: [...document.querySelectorAll('[data-workflow]')].map((el) => el.querySelector('span')?.textContent + ':' + (el.getAttribute('aria-current') === 'step' ? 'current' : el.dataset.complete === 'true' ? 'done' : 'pending')),
    wordmarkDirection: getComputedStyle(document.querySelector('.brand-wordmark')).direction,
    dir: document.documentElement.dir,
    mobileNav: !nav || getComputedStyle(nav).display === 'none' ? 'hidden' : Math.round(navBox.bottom) <= innerHeight + 1 && navBox.top >= 0 ? 'in-viewport' : 'off-viewport',
  };
};

async function main() {
  await mkdir(outDir, { recursive: true });
  const log = { base, captures: [], checks: [] };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('.cinematic-enter').first().click();
      await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
      if (shot.lang === 'ar') await page.locator('#language').click();
      await page.locator('#map-loading').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const empty = await page.evaluate(measure);
      await page.screenshot({ path: path.join(outDir, `${shot.name}-empty.png`) });

      await page.locator('#demo-select').click();
      await page.waitForFunction(() => document.querySelector('.area-stored'), {}, { timeout: 45000 });
      await page.waitForTimeout(4500);
      const selected = await page.evaluate(measure);
      const file = path.join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file });

      // Collapse and reopen the inspector: the same MapLibre canvas and the selected field must survive.
      const before = await page.evaluate(() => {
        window.__fsCanvas = document.querySelector('.maplibregl-canvas');
        return { area: document.querySelector('.area-number')?.textContent, canvas: !!window.__fsCanvas };
      });
      await page.locator('#inspector-toggle').click();
      await page.waitForTimeout(700);
      const collapsed = await page.evaluate(measure);
      await page.screenshot({ path: path.join(outDir, `${shot.name}-inspector-collapsed.png`) });
      await page.locator(shot.width >= 1025 ? '#inspector-open' : '#inspector-toggle').click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        area: document.querySelector('.area-number')?.textContent,
        sameCanvas: window.__fsCanvas === document.querySelector('.maplibregl-canvas'),
        analyzeVisible: !!document.querySelector('#analyze')?.offsetParent,
      }));

      const pass = !selected.horizontalOverflow && !empty.horizontalOverflow && !selected.controlOverlaps.length && !empty.controlOverlaps.length && !selected.inspectorOverMap && after.sameCanvas && after.area === before.area && after.analyzeVisible && !errors.length;
      log.captures.push({ file, shot });
      log.checks.push({ name: shot.name, result: pass ? 'pass' : 'fail', empty, selected, collapsed, inspectorRoundTrip: { before, after }, pageErrors: errors });
      await page.close();
    }
    await writeFile(path.join(path.dirname(outDir), 'capture-log.json'), JSON.stringify(log, null, 2));
    const failed = log.checks.filter((c) => c.result !== 'pass');
    console.log(JSON.stringify({ ok: !failed.length, captures: log.captures.length, failed: failed.map((c) => c.name) }, null, 2));
    if (failed.length) process.exitCode = 1;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
