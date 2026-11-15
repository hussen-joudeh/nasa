#!/usr/bin/env node
/** Visual V1 screenshot capture — live stack optional; stores under qa/visual-v1/screenshots/ */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.FIELDSHIFT_QA_URL ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const outDir = 'qa/visual-v1/screenshots';

const shots = [
  { name: 'desktop-1440x900-en', width: 1440, height: 900, lang: 'en', mobileView: 'explore' },
  { name: 'tablet-768x1024-en', width: 768, height: 1024, lang: 'en', mobileView: 'explore' },
  { name: 'mobile-375x812-en', width: 375, height: 812, lang: 'en', mobileView: 'explore' },
  { name: 'mobile-375x812-ar', width: 375, height: 812, lang: 'ar', mobileView: 'plan' },
];

async function enterApp(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const log = { base, captures: [] };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
      await enterApp(page);
      if (shot.lang === 'ar') await page.locator('#language').click();
      if (shot.width <= 760) {
        await page.evaluate((view) => {
          document.documentElement.dataset.mobileView = view;
        }, shot.mobileView);
      }
      if (shot.name.includes('plan') || shot.mobileView === 'plan') {
        await page.locator('[data-view="plan"]').click().catch(() => {});
        await page.locator('#planning').scrollIntoViewIfNeeded().catch(() => {});
      }
      const file = path.join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: shot.width > 760 });
      log.captures.push({ file, shot });
      await page.close();
    }
    await writeFile('qa/visual-v1/capture-log.json', JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ ok: true, captures: log.captures.length }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();