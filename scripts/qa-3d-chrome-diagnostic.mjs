#!/usr/bin/env node
/** Visual V2.1 — headed Chrome WebGL sanity check only (no app changes). */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const out = 'qa/visual-v2.1/3d-chrome-diagnostic.json';
const headed = process.env.QA_HEADED === '1';

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: headed ? [] : ['--use-gl=angle', '--use-angle=default'] });
} catch (e) {
  await mkdir('qa/visual-v2.1', { recursive: true });
  await writeFile(out, JSON.stringify({ verified: false, reason: 'Chrome channel unavailable', error: String(e) }, null, 2));
  process.exit(0);
}

const log = { base, headed, checks: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#demo-select').click();
  await page.waitForFunction(() => document.querySelector('.area-number'), {}, { timeout: 45000 });
  await page.locator('#analyze').click();
  await page.waitForFunction(() => document.querySelector('#nasa-content .weather-grid, #nasa-content .nasa-head'), {}, { timeout: 45000 });
  await page.locator('#terrain').click();
  await page.waitForTimeout(4000);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('#map canvas');
    if (!c) return { ok: false, reason: 'no canvas' };
    const gl = c.getContext('webgl') || c.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no webgl context' };
    const w = Math.min(64, c.width), h = Math.min(64, c.height);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
    const mean = sum / (px.length / 4) / 3;
    return { ok: true, meanRGB: mean, terrainPressed: document.querySelector('#terrain')?.getAttribute('aria-pressed') };
  });
  log.checks.push({ name: 'webgl_sample', ...canvas, pass: canvas.ok && canvas.meanRGB > 8 });
  await mkdir('qa/visual-v2.1', { recursive: true });
  await page.screenshot({ path: 'qa/visual-v2.1/3d-chrome-headed.png', fullPage: false });
  log.verified = log.checks.every((c) => c.pass);
  if (!headed && (!log.verified || canvas.meanRGB < 8)) log.note = 'Headless Chrome sample nearly black — treat as GPU limitation; re-run with QA_HEADED=1 for Visual V4.';
} catch (e) {
  log.verified = false;
  log.error = e.message;
} finally {
  await writeFile(out, JSON.stringify(log, null, 2));
  await browser.close();
}