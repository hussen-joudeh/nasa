#!/usr/bin/env node
/**
 * Visual V4B — Explore surface QA. Chrome channel, raw browser captures only (nothing synthetic or composited).
 *
 * Drives the real app with the genuine demo polygon and verifies: map loading, a visible field boundary,
 * the real DEM at 1×, map controls, responsive overflow, console/page errors and network health
 * (hard HTTP/tile failures are separated from normal net::ERR_ABORTED tile cancellations).
 *
 *   npm run qa:visual-v4b
 *   FIELDSHIFT_QA_URL=http://127.0.0.1:5179/  frontend to test (default port 5179; an in-process copy of the
 *                                             local static server is started when nothing answers there)
 *   QA_V4B_OUT=qa/visual-v4b                  output folder (screenshots/ + report.json)
 *   QA_HEADED=1                               headed Chrome
 *   Flags do the same: --url=… --out=… --headed
 *
 * The live MapLibre instance is observed through a read-only hook installed before the page scripts run.
 * The hook records camera calls; it never changes what is rendered.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const arg = (name) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const explicitUrl = arg('url') ?? process.env.FIELDSHIFT_QA_URL;
let base = explicitUrl ?? `http://127.0.0.1:${process.env.FIELDSHIFT_FRONTEND_PORT ?? '5179'}/`;
const outRoot = arg('out') ?? process.env.QA_V4B_OUT ?? 'qa/visual-v4b';
const shotDir = path.join(outRoot, 'screenshots');
const headed = process.argv.includes('--headed') || process.env.QA_HEADED === '1';

// V4B contract under test.
const FIT_MAX_ZOOM = 14; // the Sentinel-2 source's real maxzoom; auto-fit must not go past it
const DEM_EXAGGERATION = 1;
const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1180 };
const MOBILE = { width: 375, height: 812 };
const HOME = [-119.95, 36.78];
const TILE_HOSTS = ['tiles.maps.eox.at', 'elevation-tiles-prod', 'unpkg.com'];
const CONTROLS = ['zoom-in', 'zoom-out', 'north', 'terrain', 'orbit-left', 'orbit-right', 'reset-view', 'fit', 'draw', 'satellite', 'relief', 'clear'];

const report = { suite: 'visual-v4b', startedAt: new Date().toISOString(), base, headed, channel: 'chrome', viewport: DESKTOP, environment: {}, steps: [], probes: [], checks: [], network: { tilesOk: {}, aborted: 0, abortedSamples: [], hardFailures: [], otherHttpErrors: [] }, console: { errors: [], warnings: [], pageErrors: [] } };
const check = (step, name, pass, detail) => { report.checks.push({ step, name, pass: !!pass, detail }); if (!pass) console.error(`  ✗ [${step}] ${name}`, detail ?? ''); return !!pass; };
const metres = (a, b) => { const k = Math.PI / 180, x = (b[0] - a[0]) * k * Math.cos((a[1] + b[1]) / 2 * k), y = (b[1] - a[1]) * k; return Math.hypot(x, y) * 6371008.8; };

async function reachable(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); return r.ok; } catch { return false; } }
async function ensureFrontend() {
  if (await reachable(base)) return null;
  if (explicitUrl) throw new Error(`Frontend not reachable at ${base}`);
  const { createAppServer } = await import('./local-server.mjs');
  const { loadFieldshiftEnv } = await import('./load-fieldshift-env.mjs');
  loadFieldshiftEnv();
  const server = createAppServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/`;
  report.base = base; report.selfHosted = true;
  return server;
}

/** Read-only observation hook: registers every MapLibre map and logs camera calls. */
function installHook() {
  const state = { maps: [], calls: [], version: null, api: null };
  window.__v4b = state;
  let lib;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get: () => lib,
    set(value) {
      lib = value;
      try {
        const proto = value.Map.prototype;
        state.version = typeof value.getVersion === 'function' ? value.getVersion() : value.version ?? null;
        state.api = Object.fromEntries(['setTerrain', 'getTerrain', 'setSky', 'setLight', 'setFog', 'fitBounds', 'easeTo', 'flyTo', 'jumpTo', 'stop', 'resize', 'isMoving'].map((name) => [name, typeof proto[name]]));
        const register = (map) => { if (!state.maps.includes(map)) state.maps.push(map); };
        const on = proto.on;
        proto.on = function (...args) { register(this); return on.apply(this, args); };
        for (const name of ['fitBounds', 'easeTo', 'flyTo', 'jumpTo', 'stop']) {
          const original = proto[name];
          if (typeof original !== 'function') continue;
          proto[name] = function (...args) {
            const options = name === 'fitBounds' ? args[1] : args[0];
            state.calls.push({ name, t: Math.round(performance.now()), duration: options && typeof options === 'object' && 'duration' in options ? options.duration : null, maxZoom: options?.maxZoom ?? null });
            return original.apply(this, args);
          };
        }
      } catch (error) { state.hookError = String(error); }
    },
  });
}

function track(page, tag) {
  const net = report.network;
  page.on('response', (res) => {
    const url = res.url(), status = res.status(), host = TILE_HOSTS.find((h) => url.includes(h));
    if (host) { if (status >= 400) net.hardFailures.push({ tag, kind: 'http', status, url }); else net.tilesOk[host] = (net.tilesOk[host] ?? 0) + 1; }
    else if (status >= 400) net.otherHttpErrors.push({ tag, status, url });
  });
  page.on('requestfailed', (req) => {
    const error = req.failure()?.errorText ?? 'unknown', url = req.url();
    // MapLibre cancels tile requests it no longer needs while the camera moves; that is not a failure.
    if (/ERR_ABORTED/.test(error)) { net.aborted++; if (net.abortedSamples.length < 5) net.abortedSamples.push({ tag, url }); }
    else net.hardFailures.push({ tag, kind: 'network', error, url });
  });
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') report.console.errors.push({ tag, text: msg.text().slice(0, 400) });
    else if (type === 'warning' && report.console.warnings.length < 40) report.console.warnings.push({ tag, text: msg.text().slice(0, 300) });
  });
  page.on('pageerror', (error) => report.console.pageErrors.push({ tag, text: String(error).slice(0, 400) }));
}

const camera = (page, polygon) => page.evaluate((polygon) => {
  const m = window.__v4b?.maps.at(-1);
  if (!m) return null;
  const el = m.getContainer(), c = m.getCenter(), mapRect = el.getBoundingClientRect();
  const points = (polygon ?? []).map((p) => { const s = m.project(p); return [s.x, s.y]; });
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const box = points.length ? { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } : null;
  const overlays = [...document.querySelectorAll('.stage-layers,.stage-tools,.stage-draw,.next-step,.stage-inspector-open')].filter((o) => o.getClientRects().length && getComputedStyle(o).visibility !== 'hidden').map((o) => { const r = o.getBoundingClientRect(); return { left: r.left - mapRect.left, right: r.right - mapRect.left, top: r.top - mapRect.top, bottom: r.bottom - mapRect.top }; });
  const covered = box ? overlays.some((o) => box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top) : false;
  const terrain = typeof m.getTerrain === 'function' ? m.getTerrain() : null;
  const canvas = m.getCanvas();
  return {
    maps: window.__v4b.maps.length, zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), center: [c.lng, c.lat],
    size: [el.clientWidth, el.clientHeight], canvasCss: [canvas.clientWidth, canvas.clientHeight], moving: m.isMoving(),
    terrain: terrain ? { source: terrain.source, exaggeration: terrain.exaggeration } : null, demSource: !!m.getSource('dem'),
    mask: m.getLayer('field-mask') ? m.getLayoutProperty('field-mask', 'visibility') ?? 'visible' : null,
    layer: ['satellite', 'relief'].find((id) => (m.getLayoutProperty(id, 'visibility') ?? 'visible') === 'visible') ?? null,
    boundaryFeatures: m.getLayer('field-line') ? m.queryRenderedFeatures({ layers: ['field-line'] }).length : 0,
    box, covered, inView: box ? box.left >= 0 && box.top >= 0 && box.right <= el.clientWidth && box.bottom <= el.clientHeight : false,
    boxCentre: box ? [(box.left + box.right) / 2, (box.top + box.bottom) / 2] : null,
  };
}, polygon ?? null);

/** Real rendered pixels, read during a MapLibre render frame: overall brightness plus boundary-vs-surroundings contrast. */
const pixels = (page, polygon) => page.evaluate((polygon) => new Promise((resolve) => {
  const m = window.__v4b?.maps.at(-1);
  if (!m) return resolve({ ok: false, reason: 'no map' });
  const timer = setTimeout(() => resolve({ ok: false, reason: 'no render frame' }), 5000);
  m.once('render', () => {
    clearTimeout(timer);
    try {
      const el = m.getContainer(), w = el.clientWidth, h = el.clientHeight;
      const copy = document.createElement('canvas'); copy.width = w; copy.height = h;
      const ctx = copy.getContext('2d', { willReadFrequently: true }); ctx.drawImage(m.getCanvas(), 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const luma = (x, y) => { const i = (Math.round(y) * w + Math.round(x)) * 4; return .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; };
      let sum = 0, dark = 0, n = 0;
      for (let i = 0; i < data.length; i += 16) { const v = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; sum += v; if (v < 10) dark++; n++; }
      const result = { ok: true, meanLuma: +(sum / n).toFixed(1), darkRatio: +(dark / n).toFixed(4) };
      if (polygon?.length >= 3) {
        const pts = polygon.map((p) => { const s = m.project(p); return [s.x, s.y]; });
        const edge = [], near = [], inside = (x, y) => x >= 9 && y >= 9 && x < w - 9 && y < h - 9;
        pts.forEach((a, i) => {
          const b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 12) return;
          const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
          for (let d = 6; d < len - 6; d += 6) {
            const x = a[0] + (b[0] - a[0]) * d / len, y = a[1] + (b[1] - a[1]) * d / len;
            if (!inside(x, y)) continue;
            let best = 0; for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) best = Math.max(best, luma(x + ox, y + oy));
            edge.push(best); near.push((luma(x + nx * 8, y + ny * 8) + luma(x - nx * 8, y - ny * 8)) / 2);
          }
        });
        const median = (list) => { const s = [...list].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
        result.boundary = { samples: edge.length, edgeLuma: median(edge), nearLuma: median(near), contrast: edge.length ? +(median(edge) - median(near)).toFixed(1) : null };
      }
      resolve(result);
    } catch (error) { resolve({ ok: false, reason: String(error) }); }
  });
  m.triggerRepaint();
}), polygon ?? null);

const layout = (page) => page.evaluate((ids) => {
  const doc = document.documentElement, vw = doc.clientWidth;
  const rect = (sel) => { const el = document.querySelector(sel); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) }; };
  const controls = Object.fromEntries(ids.map((id) => { const el = document.getElementById(id); const r = el?.getClientRects().length ? el.getBoundingClientRect() : null; return [id, el ? { visible: !!r, disabled: !!el.disabled, width: r ? Math.round(r.width) : 0, height: r ? Math.round(r.height) : 0 } : null]; }));
  const attribution = document.querySelector('#map .maplibregl-ctrl-attrib');
  return {
    dir: doc.dir, lang: doc.lang, viewportWidth: vw, scrollWidth: doc.scrollWidth, overflowX: doc.scrollWidth > vw + 1,
    console: rect('#workspace'), stage: rect('#map-shell'), inspector: rect('#inspector'), tools: rect('.stage-tools'), layers: rect('.stage-layers'),
    inspectorState: document.querySelector('#workspace')?.dataset.inspector, mode: document.querySelector('#map-shell')?.dataset.mode, field: document.querySelector('#map-shell')?.dataset.field,
    loadingHidden: document.querySelector('#map-loading')?.hidden === true, terrainPressed: document.querySelector('#terrain')?.getAttribute('aria-pressed'), terrainStatus: document.querySelector('#terrain-status')?.textContent ?? '',
    overlayMode: document.querySelector('#map-overlay .overlay-mode')?.textContent ?? '', controls,
    attribution: attribution ? { text: attribution.textContent.replace(/\s+/g, ' ').trim(), visible: attribution.getClientRects().length > 0 } : null,
  };
}, CONTROLS);

async function settle(page, step = 'settle', timeout = 40000) {
  const ready = () => { const m = window.__v4b?.maps.at(-1); return !!m && !m.isMoving() && m.loaded() && m.areTilesLoaded() && document.querySelector('#map-loading')?.hidden === true; };
  try {
    await page.waitForFunction(ready, null, { timeout, polling: 100 });
    await page.waitForTimeout(400);
    await page.waitForFunction(ready, null, { timeout, polling: 100 });
    await page.waitForTimeout(250);
    return true;
  } catch (error) { check(step, 'map settles (not moving, tiles loaded)', false, String(error).slice(0, 160)); return false; }
}

async function enterApp(page, step) {
  const started = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.cinematic-enter').first().click();
  await page.locator('#workspace').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#map-loading')?.hidden === true && !!document.querySelector('#map canvas.maplibregl-canvas'), null, { timeout: 60000 });
  await settle(page, step);
  return Date.now() - started;
}

async function selectDemo(page, step) {
  await page.locator('#demo-select').click();
  await page.waitForSelector('.area-number', { timeout: 45000 });
  await settle(page, step);
}

async function setTerrain(page, on, step) {
  if ((await page.locator('#terrain').getAttribute('aria-pressed')) !== String(on)) await page.locator('#terrain').click();
  await page.waitForFunction((want) => document.querySelector('#terrain')?.getAttribute('aria-pressed') === want && !document.querySelector('#terrain')?.disabled, String(on), { timeout: 60000 });
  await settle(page, step);
}

/** Captures the viewport and the map element, then records camera, layout and pixel evidence for the step. */
async function capture(page, name, polygon, expect = {}) {
  await page.evaluate(() => document.querySelector('#map-shell')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const view = page.viewportSize();
  if (view.width >= 1025) await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(150);
  const cam = await camera(page, polygon), lay = await layout(page), px = await pixels(page, expect.field ? polygon : null);
  await page.screenshot({ path: path.join(shotDir, `${name}.png`) });
  await page.locator('#map').screenshot({ path: path.join(shotDir, 'map', `${name}.png`) });
  const step = { name, file: `screenshots/${name}.png`, mapFile: `screenshots/map/${name}.png`, viewport: view, camera: cam, layout: lay, pixels: px };
  report.steps.push(step);

  check(name, 'map loaded (loading veil hidden, canvas present)', lay.loadingHidden && !!cam);
  check(name, 'map canvas matches its container', !!cam && Math.abs(cam.size[0] - cam.canvasCss[0]) <= 1 && Math.abs(cam.size[1] - cam.canvasCss[1]) <= 1, cam && { container: cam.size, canvas: cam.canvasCss });
  check(name, 'rendered map is not black', px.ok && px.meanLuma > 18 && px.darkRatio < .5, px);
  check(name, 'no horizontal page overflow', !lay.overflowX, { scrollWidth: lay.scrollWidth, viewport: lay.viewportWidth });
  check(name, 'console and tool column stay inside the viewport', !!lay.console && lay.console.left >= -1 && lay.console.right <= lay.viewportWidth + 1 && !!lay.tools && lay.tools.left >= 0 && lay.tools.right <= lay.viewportWidth, { console: lay.console, tools: lay.tools });
  check(name, 'attribution is present', !!lay.attribution?.visible, lay.attribution);
  const always = ['terrain', 'fit', 'north', 'draw', 'satellite', 'relief'];
  check(name, 'core map controls are visible and enabled', always.every((id) => lay.controls[id]?.visible && (id === 'fit' ? lay.controls[id].disabled === !expect.field : !lay.controls[id].disabled)), Object.fromEntries(always.map((id) => [id, lay.controls[id]])));
  if (view.width <= 760) check(name, 'touch targets are at least 44px', always.every((id) => lay.controls[id].width >= 44 && lay.controls[id].height >= 44), Object.fromEntries(always.map((id) => [id, [lay.controls[id].width, lay.controls[id].height]])));
  if (expect.terrain === true) {
    check(name, `real DEM active at ${DEM_EXAGGERATION}×`, cam.terrain?.source === 'dem' && cam.terrain?.exaggeration === DEM_EXAGGERATION, cam.terrain);
    check(name, 'UI states the real DEM mode', lay.terrainPressed === 'true' && lay.mode === '3d' && /DEM|ارتفاع حقيقية/.test(lay.terrainStatus), { pressed: lay.terrainPressed, mode: lay.mode, status: lay.terrainStatus });
    check(name, '2D spotlight mask is hidden over terrain', !expect.field || cam.mask === 'none', cam.mask);
    check(name, 'view is pitched', cam.pitch > 20, cam.pitch);
  }
  if (expect.terrain === false) {
    check(name, 'terrain is off and the view is flat', cam.terrain === null && Math.abs(cam.pitch) < .01 && lay.terrainPressed === 'false' && lay.mode === '2d', { terrain: cam.terrain, pitch: cam.pitch });
  }
  if (expect.field) {
    check(name, 'field boundary is rendered', cam.boundaryFeatures > 0, cam.boundaryFeatures);
    check(name, 'whole parcel is inside the map and clear of controls', cam.inView && !cam.covered, { box: cam.box, size: cam.size, covered: cam.covered });
    check(name, 'boundary edge is brighter than its surroundings', px.boundary?.samples > 10 && px.boundary.contrast > 12, px.boundary);
  }
  if (expect.framed) check(name, `auto-fit stays at or below imagery maxzoom ${FIT_MAX_ZOOM}`, cam.zoom <= FIT_MAX_ZOOM + .001, cam.zoom);
  if (expect.layer) check(name, `${expect.layer} layer is shown`, cam.layer === expect.layer, cam.layer);
  if (expect.dir) check(name, `document direction is ${expect.dir}`, lay.dir === expect.dir, lay.dir);
  console.log(`  ✓ captured ${name} — z${cam.zoom.toFixed(2)} pitch ${cam.pitch.toFixed(0)} bearing ${cam.bearing.toFixed(0)} ${cam.terrain ? '3D' : '2D'}`);
  return step;
}

const calls = (page, since = 0) => page.evaluate((since) => window.__v4b.calls.slice(since), since);
const callCount = (page) => page.evaluate(() => window.__v4b.calls.length);
const sameCamera = (a, b, tolerance = {}) => metres(a.center, b.center) <= (tolerance.metres ?? 2) && Math.abs(a.zoom - b.zoom) <= (tolerance.zoom ?? .01) && Math.abs(a.pitch - b.pitch) <= (tolerance.angle ?? .5) && Math.abs(((a.bearing - b.bearing + 540) % 360) - 180) <= (tolerance.angle ?? .5);
const cameraDelta = (a, b) => ({ metres: +metres(a.center, b.center).toFixed(2), zoom: +(b.zoom - a.zoom).toFixed(3), pitch: +(b.pitch - a.pitch).toFixed(2), bearing: +(b.bearing - a.bearing).toFixed(2) });

/** While an automatic fit is in flight, real user input must stop it immediately and nothing may move the camera afterwards. */
async function cancelProbe(page, kind, polygon, target) {
  const name = `autofocus-cancel:${kind}`;
  const box = await page.locator('#map').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.evaluate(() => window.__v4b.maps.at(-1).panBy([230, 90], { duration: 0 }));
  await settle(page, name);
  await page.locator('#fit').click();
  await page.waitForTimeout(200);
  const mid = await camera(page);
  if (kind === 'pointer') { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up(); }
  if (kind === 'wheel') { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -200); }
  if (kind === 'keyboard') { await page.locator('#map canvas.maplibregl-canvas').focus(); await page.keyboard.press('ArrowRight'); }
  if (kind === 'touch') await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(kind === 'pointer' || kind === 'touch' ? 80 : 900);
  const after = await camera(page);
  await page.waitForTimeout(1700);
  const later = await camera(page);
  const probe = { name, inFlightWhenInterrupted: mid.moving, stoppedAt: cameraDelta(target, after), driftAfterStop: cameraDelta(after, later), reachedAutoTarget: sameCamera(later, target, { metres: 3, zoom: .02 }) };
  report.probes.push(probe);
  check(name, 'automatic fit was in flight when the user acted', mid.moving, mid.moving);
  check(name, 'automatic fit stopped and did not finish', !probe.reachedAutoTarget, probe.stoppedAt);
  check(name, 'camera is left alone after the user input', !later.moving && sameCamera(after, later), probe.driftAfterStop);
  if (kind === 'pointer' || kind === 'touch') check(name, 'motion stops immediately on press', !after.moving, after.moving);
  await page.mouse.move(box.x + 4, box.y + box.height + 30);
  await page.locator('#fit').click();
  await settle(page, name);
  return probe;
}

async function main() {
  await mkdir(path.join(shotDir, 'map'), { recursive: true });
  const server = await ensureFrontend();
  const demo = await fetch(new URL('api/demo-field', base), { signal: AbortSignal.timeout(15000) }).then((r) => { if (!r.ok) throw new Error(`/api/demo-field HTTP ${r.status}`); return r.json(); });
  const polygon = demo.field.geometry.coordinates[0].slice(0, -1);
  const centroid = demo.field.centroid.coordinates;
  report.demoField = { id: demo.field._id, vertices: polygon.length, centroid, storage: demo.storage };

  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: headed ? [] : ['--use-gl=angle', '--use-angle=default'] }); }
  catch (error) { report.blocked = { reason: 'Chrome channel unavailable', error: String(error) }; await writeFile(path.join(outRoot, 'report.json'), JSON.stringify(report, null, 2)); console.error('Chrome channel unavailable'); process.exitCode = 1; server?.close(); return; }
  report.environment.chrome = browser.version();

  const open = async (tag, options) => { const context = await browser.newContext(options); await context.addInitScript(installHook); const page = await context.newPage(); track(page, tag); return { context, page }; };

  try {
    // ---------- Desktop journey, 1440×900 ----------
    console.log('Desktop 1440×900');
    const { context, page } = await open('desktop', { viewport: DESKTOP });
    report.environment.loadMs = await enterApp(page, 'desktop-load');
    Object.assign(report.environment, await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2'), info = gl?.getExtension('WEBGL_debug_renderer_info');
      return { userAgent: navigator.userAgent, devicePixelRatio: devicePixelRatio, webglRenderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null, maplibreVersion: window.__v4b.version, maplibreApi: window.__v4b.api, hookError: window.__v4b.hookError ?? null };
    }));
    check('environment', 'runtime MapLibre exposes the camera/terrain APIs the app uses', ['setTerrain', 'fitBounds', 'easeTo', 'jumpTo', 'stop', 'resize'].every((name) => report.environment.maplibreApi?.[name] === 'function'), report.environment.maplibreApi);

    await capture(page, '01-desktop-2d', null, { terrain: false, layer: 'satellite', dir: 'ltr' });

    await setTerrain(page, true, '02-desktop-3d');
    await capture(page, '02-desktop-3d', null, { terrain: true });
    await setTerrain(page, false, '02-desktop-3d');

    // Selection: exactly one automatic fit, capped at the imagery's real maxzoom.
    let mark = await callCount(page);
    await selectDemo(page, '03-post-selection-fit');
    const selectionCalls = await calls(page, mark);
    const fit2d = (await capture(page, '03-post-selection-fit', polygon, { terrain: false, field: true, framed: true })).camera;
    check('03-post-selection-fit', 'selection frames the parcel exactly once', selectionCalls.filter((c) => c.name === 'fitBounds').length === 1, selectionCalls);
    check('03-post-selection-fit', 'selection motion is short (≤ 1.5 s)', selectionCalls.filter((c) => c.name === 'fitBounds').every((c) => c.duration !== null && c.duration <= 1500), selectionCalls.filter((c) => c.name === 'fitBounds'));
    check('03-post-selection-fit', 'parcel centre is the real stored centroid', metres(fit2d.center, centroid) < 400, { centre: fit2d.center, centroid });

    // Terrain toggle stays on the same ground.
    await setTerrain(page, true, '04-selected-field-3d');
    const fit3d = (await capture(page, '04-selected-field-3d', polygon, { terrain: true, field: true, framed: true })).camera;
    check('04-selected-field-3d', '3D view keeps a near-north bearing (|bearing| ≤ 30°)', Math.abs(fit3d.bearing) <= 30, fit3d.bearing);
    check('04-selected-field-3d', '3D pitch is moderate (35°–55°)', fit3d.pitch >= 35 && fit3d.pitch <= 55, fit3d.pitch);
    check('04-selected-field-3d', 'parcel stays where it was on screen when 3D turns on (≤ 60 px)', Math.hypot(fit3d.boxCentre[0] - fit2d.boxCentre[0], fit3d.boxCentre[1] - fit2d.boxCentre[1]) <= 60, { before: fit2d.boxCentre, after: fit3d.boxCentre });
    await setTerrain(page, false, '05-2d-after-toggle');
    const back2d = (await capture(page, '05-2d-after-toggle', polygon, { terrain: false, field: true, framed: true })).camera;
    check('05-2d-after-toggle', '3D → 2D returns to the same geographic framing', sameCamera(fit2d, back2d, { metres: 3, zoom: .02 }), cameraDelta(fit2d, back2d));
    check('05-2d-after-toggle', 'spotlight mask returns in 2D', back2d.mask === 'visible', back2d.mask);

    // When the user has moved the map, the toggle changes the angle only: same centre, same zoom.
    await page.evaluate(() => { const m = window.__v4b.maps.at(-1); m.jumpTo({ center: [m.getCenter().lng + .004, m.getCenter().lat + .002], zoom: 15.4 }); });
    const box0 = await page.locator('#map').boundingBox();
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2); await page.mouse.down(); await page.mouse.move(box0.x + box0.width / 2 + 40, box0.y + box0.height / 2 + 20, { steps: 4 }); await page.mouse.up();
    await settle(page, 'toggle-anchor');
    const userView = await camera(page, polygon);
    await setTerrain(page, true, 'toggle-anchor');
    const userView3d = await camera(page, polygon);
    await setTerrain(page, false, 'toggle-anchor');
    const userViewBack = await camera(page, polygon);
    report.probes.push({ name: 'toggle-anchor:user-view', on: cameraDelta(userView, userView3d), roundTrip: cameraDelta(userView, userViewBack) });
    check('toggle-anchor', 'toggle keeps the user’s centre and zoom when they have moved the map', metres(userView.center, userView3d.center) < 25 && Math.abs(userView.zoom - userView3d.zoom) < .05 && metres(userView.center, userViewBack.center) < 25 && Math.abs(userView.zoom - userViewBack.zoom) < .05, { on: cameraDelta(userView, userView3d), roundTrip: cameraDelta(userView, userViewBack) });
    await setTerrain(page, true, 'toggle-anchor');
    await page.locator('#fit').click();
    await settle(page, 'toggle-anchor');
    const framed3d = await camera(page, polygon);

    // Layer switch: imagery changes, camera and map instance do not.
    mark = await callCount(page);
    await page.locator('#relief').click();
    await settle(page, '06-relief-3d');
    const relief = (await capture(page, '06-relief-3d', polygon, { terrain: true, field: true, framed: true, layer: 'relief' })).camera;
    await page.locator('#satellite').click();
    await settle(page, '07-satellite-3d');
    const satellite = (await capture(page, '07-satellite-3d', polygon, { terrain: true, field: true, framed: true, layer: 'satellite' })).camera;
    const layerCalls = await calls(page, mark);
    check('06-relief-3d', 'layer switch does not move the camera', sameCamera(framed3d, relief) && sameCamera(framed3d, satellite) && layerCalls.length === 0, { relief: cameraDelta(framed3d, relief), satellite: cameraDelta(framed3d, satellite), calls: layerCalls });
    check('06-relief-3d', 'layer switch keeps the same map instance', relief.maps === 1 && satellite.maps === 1, relief.maps);

    // User input cancels an automatic fit.
    for (const kind of ['pointer', 'wheel', 'keyboard']) await cancelProbe(page, kind, polygon, framed3d);

    // Inspector collapse: map grows, parcel stays framed, same instance.
    const beforeCollapse = await camera(page, polygon);
    await page.locator('#inspector-toggle').click();
    await page.waitForFunction((w) => window.__v4b.maps.at(-1).getContainer().clientWidth > w + 100, beforeCollapse.size[0], { timeout: 10000 });
    await settle(page, '08-inspector-collapsed');
    const collapsed = (await capture(page, '08-inspector-collapsed', polygon, { terrain: true, field: true, framed: true })).camera;
    check('08-inspector-collapsed', 'map uses the freed width', collapsed.size[0] > beforeCollapse.size[0] + 100, { before: beforeCollapse.size, after: collapsed.size });
    check('08-inspector-collapsed', 'same map instance, zoom, pitch and bearing', collapsed.maps === 1 && Math.abs(collapsed.zoom - beforeCollapse.zoom) < .02 && Math.abs(collapsed.pitch - beforeCollapse.pitch) < .5 && Math.abs(collapsed.bearing - beforeCollapse.bearing) < .5, cameraDelta(beforeCollapse, collapsed));
    check('08-inspector-collapsed', 'parcel stays centred in the wider map (≤ 40 px from the padded centre)', Math.abs(collapsed.boxCentre[0] - collapsed.size[0] / 2) <= 40, { boxCentre: collapsed.boxCentre, size: collapsed.size });
    await page.locator('#inspector-open').click();
    await page.waitForFunction((w) => window.__v4b.maps.at(-1).getContainer().clientWidth < w - 100, collapsed.size[0], { timeout: 10000 });
    await settle(page, '08-inspector-collapsed');
    const reopened = await camera(page, polygon);
    check('08-inspector-collapsed', 'reopening the inspector restores the framing', reopened.inView && !reopened.covered && sameCamera(beforeCollapse, reopened, { metres: 5, zoom: .02 }), cameraDelta(beforeCollapse, reopened));

    // Arabic RTL: same map, same terrain, mirrored framing.
    await page.locator('#language').click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    await settle(page, '09-arabic-rtl');
    const rtl = (await capture(page, '09-arabic-rtl', polygon, { terrain: true, field: true, framed: true, dir: 'rtl' })).camera;
    check('09-arabic-rtl', 'language switch keeps the same map instance and zoom', rtl.maps === 1 && Math.abs(rtl.zoom - reopened.zoom) < .02 && Math.abs(rtl.pitch - reopened.pitch) < .5, cameraDelta(reopened, rtl));
    // A view the user chose survives a language switch untouched.
    await page.locator('#zoom-in').click();
    await settle(page, '09-arabic-rtl');
    const userZoom = await camera(page, polygon);
    await page.locator('#language').click();
    await page.waitForFunction(() => document.documentElement.dir === 'ltr');
    await page.waitForTimeout(1600);
    await settle(page, '09-arabic-rtl');
    const afterLanguage = await camera(page, polygon);
    report.probes.push({ name: 'language-switch:user-view', delta: cameraDelta(userZoom, afterLanguage) });
    check('09-arabic-rtl', 'language switch does not override a camera the user chose', afterLanguage.maps === 1 && sameCamera(userZoom, afterLanguage, { metres: 3, zoom: .02 }), cameraDelta(userZoom, afterLanguage));
    check('09-arabic-rtl', 'terrain and hidden mask survive language switches', afterLanguage.terrain?.exaggeration === DEM_EXAGGERATION && afterLanguage.mask === 'none', { terrain: afterLanguage.terrain, mask: afterLanguage.mask });
    await context.close();

    // ---------- Pending autofocus: user input before the DEM arrives ----------
    console.log('Pending-autofocus probes');
    const coordinates = polygon.map(([lon, lat]) => `${lat}, ${lon}`).join('\n');
    const applyBoundary = async (p) => { await p.locator('.inspector-editor summary').click(); await p.locator('#coordinates').fill(coordinates); await p.locator('#apply').click(); };
    {
      const { context: ctx, page: p } = await open('pending-fit', { viewport: DESKTOP });
      await enterApp(p, 'pending-fit');
      const start = await callCount(p);
      await applyBoundary(p);
      await p.waitForFunction(() => document.querySelector('#terrain')?.getAttribute('aria-pressed') === 'true', null, { timeout: 60000 });
      await settle(p, 'pending-fit');
      const cam = await camera(p, polygon), made = await calls(p, start);
      report.probes.push({ name: 'selection-3d-auto', calls: made, camera: cam });
      check('selection-3d-auto', 'a typed boundary loads the real DEM and frames the parcel once, obliquely', made.filter((c) => c.name === 'fitBounds').length === 1 && cam.terrain?.exaggeration === DEM_EXAGGERATION && cam.pitch > 20 && cam.inView && cam.zoom <= FIT_MAX_ZOOM + .001 && cam.mask === 'none', { fits: made.filter((c) => c.name === 'fitBounds'), zoom: cam.zoom, pitch: cam.pitch, inView: cam.inView, mask: cam.mask });
      await ctx.close();
    }
    {
      const { context: ctx, page: p } = await open('pending-cancel', { viewport: DESKTOP });
      // Hold the DEM back so the user demonstrably acts while the automatic fit is still pending. No screenshots are taken here.
      await p.route('**/elevation-tiles-prod/**', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
      await enterApp(p, 'pending-cancel');
      const box = await p.locator('#map').boundingBox();
      await applyBoundary(p);
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.wheel(0, -150);
      const pressedEarly = await p.locator('#terrain').getAttribute('aria-pressed');
      // Applying a far-away boundary jumps to it at once (by design, before any input). What must not happen is a camera move after the user has taken over.
      const atInput = await camera(p, polygon), callsAtInput = await callCount(p);
      await p.waitForFunction(() => document.querySelector('#terrain')?.getAttribute('aria-pressed') === 'true' || /failed|unavailable/i.test(document.querySelector('#terrain-status')?.textContent ?? ''), null, { timeout: 60000 });
      await p.waitForTimeout(2500);
      const cam = await camera(p, polygon);
      report.probes.push({ name: 'pending-autofocus-cancel:wheel', demPendingWhenUserActed: pressedEarly === 'false', metresFromHome: Math.round(metres(cam.center, HOME)), metresFromParcel: Math.round(metres(cam.center, centroid)) });
      check('pending-autofocus-cancel', 'the DEM was still pending when the user scrolled', pressedEarly === 'false', pressedEarly);
      const afterInput = (await calls(p, callsAtInput)).filter((c) => ['fitBounds', 'easeTo', 'flyTo', 'jumpTo'].includes(c.name));
      check('pending-autofocus-cancel', 'a pending automatic fit never overrides the user’s view', afterInput.length === 0 && metres(cam.center, atInput.center) < 50 && cam.pitch === 0, { cameraCallsAfterInput: afterInput, metresMovedAfterInput: Math.round(metres(cam.center, atInput.center)), pitch: cam.pitch, metresFromParcel: Math.round(metres(cam.center, centroid)) });
      await ctx.close();
    }

    // ---------- Tablet ----------
    console.log('Tablet 820×1180');
    {
      const { context: ctx, page: p } = await open('tablet', { viewport: TABLET, hasTouch: true });
      await enterApp(p, '10-tablet-3d');
      await selectDemo(p, '10-tablet-3d');
      await setTerrain(p, true, '10-tablet-3d');
      await capture(p, '10-tablet-3d', polygon, { terrain: true, field: true, framed: true });
      await ctx.close();
    }

    // ---------- Mobile ----------
    console.log('Mobile 375×812');
    {
      const { context: ctx, page: p } = await open('mobile', { viewport: MOBILE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await enterApp(p, '11-mobile-3d');
      await selectDemo(p, '11-mobile-3d');
      await setTerrain(p, true, '11-mobile-3d');
      const mobile = (await capture(p, '11-mobile-3d', polygon, { terrain: true, field: true, framed: true })).camera;
      await p.evaluate(() => document.querySelector('#map-shell')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await cancelProbe(p, 'touch', polygon, mobile);
      await ctx.close();
    }

    // ---------- Reduced motion ----------
    console.log('Reduced motion 1440×900');
    {
      const { context: ctx, page: p } = await open('reduced-motion', { viewport: DESKTOP, reducedMotion: 'reduce' });
      await enterApp(p, '12-reduced-motion');
      const start = await callCount(p);
      await p.locator('#demo-select').click();
      await p.waitForSelector('.area-number', { timeout: 45000 });
      const movingAfterSelect = await p.evaluate(() => window.__v4b.maps.at(-1).isMoving());
      await settle(p, '12-reduced-motion');
      await p.locator('#terrain').click();
      await p.waitForFunction(() => document.querySelector('#terrain')?.getAttribute('aria-pressed') === 'true' && !document.querySelector('#terrain')?.disabled, null, { timeout: 60000 });
      await settle(p, '12-reduced-motion');
      await p.locator('#orbit-right').click();
      const movingAfterOrbit = await p.evaluate(() => window.__v4b.maps.at(-1).isMoving());
      await p.locator('#orbit-left').click();
      await p.locator('#north').click();
      await p.locator('#fit').click();
      const movingAfterFit = await p.evaluate(() => window.__v4b.maps.at(-1).isMoving());
      await settle(p, '12-reduced-motion');
      const made = await calls(p, start), animated = made.filter((c) => c.name !== 'stop' && c.name !== 'jumpTo' && c.duration !== 0);
      const running = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
      await capture(p, '12-reduced-motion', polygon, { terrain: true, field: true, framed: true });
      report.probes.push({ name: 'reduced-motion', calls: made, runningCssAnimations: running });
      check('12-reduced-motion', 'every camera call is instant (duration 0)', animated.length === 0, animated);
      check('12-reduced-motion', 'the map is never mid-animation after an action', !movingAfterSelect && !movingAfterOrbit && !movingAfterFit, { movingAfterSelect, movingAfterOrbit, movingAfterFit });
      check('12-reduced-motion', 'no CSS animation is running', running === 0, running);
      await ctx.close();
    }
  } catch (error) {
    report.error = String(error?.stack ?? error).slice(0, 1200);
    console.error(error);
  } finally {
    await browser.close();
    server?.close();
  }

  const net = report.network;
  check('network', 'no hard HTTP or network failures for tiles, DEM or the map library', net.hardFailures.length === 0, net.hardFailures.slice(0, 10));
  check('network', 'imagery and DEM tiles were actually served', (net.tilesOk['tiles.maps.eox.at'] ?? 0) > 0 && (net.tilesOk['elevation-tiles-prod'] ?? 0) > 0, net.tilesOk);
  check('console', 'no console errors', report.console.errors.length === 0, report.console.errors.slice(0, 10));
  check('console', 'no uncaught page errors', report.console.pageErrors.length === 0, report.console.pageErrors.slice(0, 10));
  check('console', 'no "cannot fit" camera warnings', !report.console.warnings.some((w) => /cannot fit/i.test(w.text)), report.console.warnings.filter((w) => /cannot fit/i.test(w.text)));

  const failed = report.checks.filter((c) => !c.pass);
  report.finishedAt = new Date().toISOString();
  report.summary = { ok: !report.error && failed.length === 0, screenshots: report.steps.length, checks: report.checks.length, failed: failed.length, abortedTileRequests: net.aborted, hardFailures: net.hardFailures.length, consoleErrors: report.console.errors.length, pageErrors: report.console.pageErrors.length };
  await writeFile(path.join(outRoot, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report.summary, failedChecks: failed.map((c) => `[${c.step}] ${c.name}`), error: report.error?.split('\n')[0] }, null, 2));
  if (!report.summary.ok) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
