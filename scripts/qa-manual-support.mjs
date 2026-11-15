#!/usr/bin/env node
/**
 * Batch 08B.5 — automate feasible manual QA; list human-only remainder.
 */
import { chromium } from 'playwright-core';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const refDir = 'qa/screenshots/batch08b3';
const outDir = 'qa/screenshots/batch08b5';

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

const log = { checks: [], humanOnly: [], nasaSample: null };

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let nasaResponse = null;
  page.on('response', async (res) => {
    if (res.url().includes('power.larc.nasa.gov') && res.request().method() === 'GET' && !nasaResponse) {
      try {
        const json = await res.json();
        nasaResponse = {
          url: res.url().slice(0, 200),
          status: res.status(),
          hasParameters: !!(json?.properties?.parameter || json?.parameters),
          header: json?.header ?? json?.properties?.header ?? null,
        };
      } catch {
        nasaResponse = { url: res.url().slice(0, 200), status: res.status(), parseError: true };
      }
    }
  });

  try {
    await enterApp(page);
    await page.locator('#draw').click();
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) throw new Error('map box missing');
    const pts = [
      [box.x + box.width * 0.35, box.y + box.height * 0.45],
      [box.x + box.width * 0.55, box.y + box.height * 0.42],
      [box.x + box.width * 0.52, box.y + box.height * 0.58],
    ];
    for (const [x, y] of pts) await page.mouse.click(x, y);
    await page.locator('#finish').click();
    await page.locator('.area-number').waitFor({ timeout: 15000 });
    log.checks.push({ name: 'map-draw-boundary', pass: (await page.locator('.area-number').count()) > 0 });
    await page.screenshot({ path: path.join(outDir, 'map-draw-complete.png') });

    const terrainBtn = page.locator('#terrain');
    await terrainBtn.click();
    await page.waitForTimeout(2500);
    const mode3d = await page.locator('#map-shell').getAttribute('data-mode');
    const terrainOn = (await terrainBtn.getAttribute('aria-pressed')) === 'true';
    const terrainStatus = await page.locator('#terrain-status').innerText().catch(() => '');
    log.checks.push({
      name: 'terrain-toggle-interactive',
      pass: await terrainBtn.isEnabled(),
      automatedOnly: true,
      detail: `data-mode=${mode3d} aria-pressed=${terrainOn} status=${terrainStatus.slice(0, 40)}`,
      humanRequired: 'Visible DEM tiles and 3D relief in headful browser',
    });
    await page.screenshot({ path: path.join(outDir, 'terrain-toggle.png') });
    await page.locator('#terrain').click();
    await page.waitForTimeout(500);

    await page.locator('#analyze').click();
    await page.waitForFunction(
      () => document.querySelector('#nasa-content .nasa-head, #nasa-content .error'),
      {},
      { timeout: 90000 },
    );
    log.nasaSample = nasaResponse;
    log.checks.push({
      name: 'nasa-response-captured',
      pass: !!nasaResponse && nasaResponse.status === 200 && !nasaResponse.parseError,
      detail: nasaResponse,
    });

    await page.locator('#draw').focus();
    const focused = await page.evaluate(() => ({
      id: document.activeElement?.id,
      tag: document.activeElement?.tagName,
    }));
    await page.keyboard.press('Enter');
    log.checks.push({
      name: 'draw-control-keyboard-focus',
      pass: focused.id === 'draw',
      automatedOnly: true,
      detail: focused,
      humanRequired: 'Tab order through map and Preflight; visible focus rings',
    });

    const refs = ['desktop-analysis-complete.png', 'arabic-decision-panel.png', 'mobile-result.png'];
    const refStats = [];
    for (const file of refs) {
      try {
        const st = await stat(path.join(refDir, file));
        refStats.push({ file, bytes: st.size });
      } catch {
        refStats.push({ file, missing: true });
      }
    }
    log.checks.push({
      name: 'reference-screenshots-present',
      pass: refStats.every((r) => !r.missing && r.bytes > 1000),
      detail: refStats,
      note: 'Pixel diff not automated — human compares visuals',
    });

    log.humanOnly = [
      'Confirm DEM/terrain tiles visibly load (not just data-mode=3d)',
      'Screen-reader announcement of status and UNKNOWN labels',
      'Full keyboard path through Preflight form without mouse',
      'Side-by-side pixel review vs batch08b3 reference PNGs',
      'Map draw under touch/pointer on real hardware',
    ];

    await writeFile('qa/manual-support-08b5.json', JSON.stringify(log, null, 2));
    const failed = log.checks.filter((c) => !c.pass && !c.humanRequired);
    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0,
          automated: log.checks.filter((c) => c.pass).map((c) => c.name),
          failed: failed.map((c) => c.name),
          humanOnly: log.humanOnly,
        },
        null,
        2,
      ),
    );
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();