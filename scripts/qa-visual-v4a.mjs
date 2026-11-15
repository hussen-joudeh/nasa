#!/usr/bin/env node
/** Visual V4A — 3D terrain reliability journey + diagnostics. */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const outDir = 'qa/visual-v4a/screenshots';
const headed = process.env.QA_HEADED === '1';

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#map canvas.maplibregl-canvas') || document.querySelector('#map canvas');
    if (!c) return { ok: false, reason: 'no canvas' };
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false, reason: 'no webgl' };
    const w = Math.min(128, c.width);
    const h = Math.min(128, c.height);
    const px = new Uint8Array(w * h * 4);
    try {
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    } catch (e) {
      return { ok: false, reason: 'readPixels: ' + e.message };
    }
    let sum = 0;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) {
      const rgb = px[i] + px[i + 1] + px[i + 2];
      sum += rgb;
      if (rgb < 24) dark++;
    }
    const mean = sum / (px.length / 4) / 3;
    const darkRatio = dark / (px.length / 4);
    return {
      ok: true,
      meanRGB: mean,
      darkRatio,
      canvas: { w: c.width, h: c.height },
      pitch: window.maplibregl ? undefined : document.querySelector('.maplibregl-map')?._pitch,
    };
  });
}

async function mapState(page) {
  return page.evaluate(() => {
    const mapEl = document.querySelector('#map .maplibregl-map');
    const terrainBtn = document.querySelector('#terrain');
    const status = document.querySelector('#terrain-status')?.textContent ?? '';
    const shell = document.querySelector('#map-shell');
    return {
      terrainPressed: terrainBtn?.getAttribute('aria-pressed'),
      terrainStatus: status,
      mode: shell?.dataset?.mode,
      field: shell?.dataset?.field,
      hasFieldLine: !!document.querySelector('.maplibregl-canvas'),
    };
  });
}

async function waitMapIdle(page, ms = 12000) {
  await page.waitForFunction(
    () => {
      const loading = document.querySelector('#map-loading');
      return loading?.hidden !== false && document.querySelector('.maplibregl-canvas');
    },
    {},
    { timeout: ms },
  );
  await page.waitForTimeout(800);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const report = { base, headed, channel: 'chrome', steps: [], tileLog: [], errors: [] };
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !headed,
      args: headed ? [] : ['--use-gl=angle', '--use-angle=default'],
    });
  } catch (e) {
    report.blocked = { reason: 'Chrome channel unavailable', error: String(e) };
    await writeFile('qa/visual-v4a/diagnostic-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: false, blocked: true }, null, 2));
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failedDem = [];
  const demResponses = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('elevation-tiles-prod') || u.includes('terrarium')) {
      demResponses.push({ url: u, status: res.status() });
      if (res.status() >= 400) failedDem.push({ url: u, status: res.status() });
    }
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (u.includes('elevation') || u.includes('terrarium') || u.includes('maps.eox')) {
      report.tileLog.push({ type: 'failed', url: u, error: req.failure()?.errorText });
    }
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (/maplibre|terrain|webgl|dem/i.test(t) && report.errors.length < 25) report.errors.push({ kind: 'console', text: t });
  });

  try {
    await enterApp(page);
    await waitMapIdle(page);
    await page.locator('#map').screenshot({ path: `${outDir}/01-2d-default.png` });
    report.steps.push({ name: '2d-default', ...(await sampleCanvas(page)), ...(await mapState(page)) });

    await page.locator('#demo-select').click();
    await page.waitForSelector('.area-number', { timeout: 45000 });
    await page.locator('#fit').click();
    await waitMapIdle(page);
    await page.locator('#map').screenshot({ path: `${outDir}/02-2d-demo-fit.png` });
    report.steps.push({ name: '2d-demo-fit', ...(await sampleCanvas(page)), ...(await mapState(page)) });

    await page.locator('#terrain').click();
    await page.locator('#terrain:not([disabled])').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#terrain')?.getAttribute('aria-pressed') === 'true', {}, { timeout: 30000 });
    await page.waitForTimeout(headed ? 2000 : 3000);
    await waitMapIdle(page, 20000);
    await page.locator('#map').screenshot({ path: `${outDir}/03-3d-terrain-on.png` });
    const s3d = { ...(await sampleCanvas(page)), ...(await mapState(page)) };
    report.steps.push({ name: '3d-terrain-on', ...s3d });

    await page.locator('#orbit-right').click();
    await page.waitForTimeout(1500);
    await page.locator('#map').screenshot({ path: `${outDir}/04-3d-orbit.png` });

    await page.locator('#terrain').click();
    await page.waitForFunction(() => document.querySelector('#terrain')?.getAttribute('aria-pressed') === 'false', {}, { timeout: 15000 });
    await page.locator('#map').screenshot({ path: `${outDir}/05-2d-terrain-off.png` });

    await page.locator('#terrain').click();
    await page.waitForTimeout(5000);
    await page.locator('#relief').click();
    await waitMapIdle(page);
    await page.locator('#map').screenshot({ path: `${outDir}/06-relief-3d.png` });

    await page.locator('#satellite').click();
    await page.locator('#fit').click();
    await waitMapIdle(page);
    await page.locator('#map').screenshot({ path: `${outDir}/07-fit-3d-satellite.png` });

    await page.locator('#inspector-toggle').click();
    await page.waitForTimeout(600);
    await page.locator('#zoom-in').click();
    await page.locator('#map').screenshot({ path: `${outDir}/08-inspector-collapsed-3d.png` });

    await page.locator('#language').click();
    await page.waitForTimeout(1200);
    await page.locator('#map').screenshot({ path: `${outDir}/09-ar-rtl-map.png` });

    await page.locator('#terrain').click();
    await page.waitForTimeout(2000);
    await page.locator('#map').screenshot({ path: `${outDir}/10-2d-after-toggle-ar.png` });

    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await enterApp(mobile);
    await mobile.locator('#demo-select').click();
    await mobile.waitForSelector('.area-number', { timeout: 45000 });
    await mobile.locator('#fit').click();
    await mobile.locator('#terrain').click();
    await mobile.waitForTimeout(5000);
    await mobile.locator('#map').screenshot({ path: `${outDir}/11-mobile-3d.png` });
    report.steps.push({ name: 'mobile-3d', ...(await sampleCanvas(mobile)), ...(await mapState(mobile)) });
    await mobile.close();

    report.demResponses = demResponses.slice(0, 40);
    report.failedDem = failedDem;
    report.verified = report.steps.some((s) => s.name === '3d-terrain-on' && s.terrainPressed === 'true' && s.terrainStatus?.includes('DEM'));
    report.headlessNote = !headed ? 'Run QA_HEADED=1 for GPU-verified terrain pixels.' : undefined;
  } catch (e) {
    report.error = e.message;
    report.verified = false;
  } finally {
    await browser.close();
  }
  await writeFile('qa/visual-v4a/diagnostic-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: !report.error, verified: report.verified, steps: report.steps?.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});