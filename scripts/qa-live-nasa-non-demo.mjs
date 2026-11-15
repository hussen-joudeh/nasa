#!/usr/bin/env node
/**
 * Batch 08B.4 — non-demo field must use live NASA POWER (no MongoDB substitution).
 */
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const coords = '36.780, -119.950\n36.780, -119.940\n36.785, -119.940\n36.785, -119.950';
const expectedLat = 36.782;

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

const log = { startedAt: new Date().toISOString(), base, nasaRequests: [], checks: [] };

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('power.larc.nasa.gov')) log.nasaRequests.push(url);
  });
  try {
    await enterApp(page);
    await page.getByText('Enter boundary coordinates', { exact: true }).click();
    await page.locator('#coordinates').fill(coords);
    await page.locator('#apply').click();
    await page.locator('.area-number').waitFor({ timeout: 15000 });
    const demoStatus = await page.locator('#demo-status').innerText();
    log.checks.push({
      name: 'no-demo-association',
      pass: /No MongoDB|لا يوجد ارتباط/.test(demoStatus),
      detail: demoStatus.slice(0, 120),
    });
    await page.locator('#analyze').click();
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#nasa-content .nasa-head, #nasa-content .error');
        return el && !document.querySelector('#nasa-content .loading');
      },
      {},
      { timeout: 90000 },
    );
    const nasaHtml = await page.locator('#nasa-content').innerHTML();
    const nasaText = await page.locator('#nasa-content').innerText();
    const err = await page.locator('#nasa-content .error').count();
    if (err) {
      log.checks.push({
        name: 'live-nasa-data',
        pass: false,
        blocked: true,
        detail: nasaText.slice(0, 200),
      });
    } else {
      const link = await page.locator('#nasa-content a[href*="power.larc.nasa.gov"]').count();
      const mongoBadge = await page.locator('#nasa-content .demo-source').count();
      const periodOk = /\d{4}-\d{2}-\d{2}\s*[—–-]\s*\d{4}-\d{2}-\d{2}/.test(nasaText);
      const sampleOk = nasaText.includes('36.782') && nasaText.includes('-119.94');
      log.checks.push({ name: 'nasa-power-link', pass: link > 0, detail: `links=${link}` });
      log.checks.push({ name: 'no-mongodb-provenance', pass: mongoBadge === 0 && !/MongoDB/.test(nasaHtml), detail: `demo-source=${mongoBadge}` });
      log.checks.push({ name: 'observation-period-shown', pass: periodOk, detail: nasaText.match(/\d{4}-\d{2}-\d{2}.*\d{4}-\d{2}-\d{2}/)?.[0] ?? '' });
      log.checks.push({ name: 'sample-coordinates', pass: sampleOk, detail: 'vertex-average ~36.782, -119.94' });
      log.checks.push({
        name: 'power-api-request',
        pass: log.nasaRequests.some((u) => u.includes('latitude=') && u.includes('longitude=')),
        detail: log.nasaRequests[0]?.slice(0, 160) ?? 'none',
      });
    }
    const passed = log.checks.filter((c) => c.pass).length;
    const blocked = log.checks.some((c) => c.blocked);
    log.summary = { passed, total: log.checks.length, blocked, liveNasa: !blocked && passed === log.checks.length };
    await writeFile('qa/live-nasa-non-demo.json', JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log.summary, null, 2));
    if (blocked) process.exitCode = 2;
    else if (!log.summary.liveNasa) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();