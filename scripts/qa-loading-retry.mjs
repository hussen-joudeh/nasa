#!/usr/bin/env node
/**
 * Batch 08B.4 — loading states, stale-request guard, manual retry via Analyze.
 */
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const coords = '36.780, -119.950\n36.780, -119.940\n36.785, -119.940\n36.785, -119.950';

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

const log = { startedAt: new Date().toISOString(), base, checks: [] };

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  let blockNasa = false;
  cdp.on('Fetch.requestPaused', async (event) => {
    const url = event.request.url;
    if (blockNasa && url.includes('power.larc.nasa.gov')) {
      await cdp.send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: 503,
        body: Buffer.from('unavailable').toString('base64'),
      });
    } else {
      await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
    }
  });
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*power.larc.nasa.gov*' }],
  });

  try {
    await enterApp(page);
    await page.getByText('Enter boundary coordinates', { exact: true }).click();
    await page.locator('#coordinates').fill(coords);
    await page.locator('#apply').click();
    await page.locator('#analyze').click();
    const sawLoading = await page
      .waitForSelector('#nasa-content .loading', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    log.checks.push({ name: 'nasa-loading-shown', pass: sawLoading });

    blockNasa = true;
    await page.locator('#analyze').click();
    await page.waitForFunction(
      () => document.querySelector('#nasa-content .error') && !document.querySelector('#analyze').disabled,
      {},
      { timeout: 60000 },
    );
    const errText = await page.locator('#nasa-content .error').innerText();
    log.checks.push({
      name: 'nasa-failure-honest',
      pass: /unavailable|NASA/i.test(errText),
      detail: errText.slice(0, 120),
    });
    log.checks.push({ name: 'analyze-reenabled-after-fail', pass: await page.locator('#analyze').isEnabled() });

    blockNasa = false;
    await page.locator('#analyze').click();
    await page.waitForFunction(
      () => document.querySelector('#nasa-content .nasa-head') && !document.querySelector('#nasa-content .loading'),
      {},
      { timeout: 90000 },
    );
    log.checks.push({
      name: 'nasa-retry-success',
      pass: (await page.locator('#nasa-content .nasa-head').count()) > 0,
    });

    await page.locator('#planning').scrollIntoViewIfNeeded();
    await page.locator('#run-preflight').click();
    await page.waitForFunction(() => document.querySelector('.preflight-not-run, .preflight-evaluation'), {}, { timeout: 15000 });
    const notRun = await page.locator('.preflight-not-run').count();
    log.checks.push({ name: 'preflight-without-climate-stays-not-run-or-unknown', pass: notRun > 0 || (await page.locator('[data-status="UNKNOWN"]').count()) > 0 });

    await writeFile('qa/loading-retry-results.json', JSON.stringify(log, null, 2));
    const failed = log.checks.filter((c) => !c.pass);
    console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.map((c) => c.name) }, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();