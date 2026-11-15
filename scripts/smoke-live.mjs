#!/usr/bin/env node
/**
 * Live full-stack smoke test — requires running MongoDB, backend, and frontend.
 * No fixtures; fails if dependencies are missing or the wrong backend port is proxied.
 */
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FIELD_ID } from '../backend/scripts/demo-config.mjs';
import {
  DEFAULT_FRONTEND_PORT,
  resolveApiTarget,
} from './fieldshift-config.mjs';
import { loadFieldshiftEnv } from './load-fieldshift-env.mjs';

const frontendPort = Number(process.env.FIELDSHIFT_FRONTEND_PORT ?? DEFAULT_FRONTEND_PORT);
const api = resolveApiTarget();
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
const report = { startedAt: new Date().toISOString(), api: api.origin, frontend: frontendOrigin, checks: [] };

function record(name, ok, detail) {
  report.checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${detail}`);
}

export async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body };
}

export async function runLiveSmoke({
  frontendOrigin: feOrigin = frontendOrigin,
  apiOrigin = api.origin,
} = {}) {
  const home = await fetch(feOrigin + '/', { signal: AbortSignal.timeout(8000) });
  record('frontend_http', home.status === 200, `status=${home.status}`);

  const proxyHealth = await fetchJson(`${feOrigin}/api/health`);
  record('frontend_proxy_reaches_backend', proxyHealth.status === 200 || proxyHealth.status === 503, `status=${proxyHealth.status}`);
  if (proxyHealth.body?.error?.includes?.('Stale')) {
    record('not_stale_backend', false, proxyHealth.body.error);
  }

  const directHealth = await fetchJson(`${apiOrigin}/api/health`);
  record('backend_health_route_exists', directHealth.status !== 404 && !directHealth.body?.error?.includes?.('Route not found'),
    directHealth.status === 404 ? 'Stale API on proxy target — missing /api/health' : `status=${directHealth.status}`);
  record('backend_http', true, 'responding');
  record('mongodb_reachable', directHealth.body?.mongodb?.reachable === true, JSON.stringify(directHealth.body?.mongodb));
  record('demo_evidence_ready', directHealth.body?.evidence?.collectionsMatch === true, JSON.stringify(directHealth.body?.evidence));
  record('analysis_ready', directHealth.body?.analysis?.ready === true, JSON.stringify(directHealth.body?.analysis));
  assert.equal(directHealth.status, 200, 'health should be 200 when fully ready');

  record(
    'proxy_readiness_contract',
    proxyHealth.body?.http === true && proxyHealth.body?.mongodb?.reachable !== undefined,
    'Restart frontend with FIELDSHIFT_API_PORT matching PORT (stale proxy omits mongodb/readiness fields).',
  );
  const proxyMatchesBackend =
    JSON.stringify({
      ready: proxyHealth.body?.ready,
      fieldId: proxyHealth.body?.fieldId,
      analysis: proxyHealth.body?.analysis,
      mongodb: proxyHealth.body?.mongodb,
    }) ===
    JSON.stringify({
      ready: directHealth.body?.ready,
      fieldId: directHealth.body?.fieldId,
      analysis: directHealth.body?.analysis,
      mongodb: directHealth.body?.mongodb,
    });
  record('proxy_same_backend_as_direct', proxyMatchesBackend, `proxy→${JSON.stringify(proxyHealth.body?.mongodb)} direct→${JSON.stringify(directHealth.body?.mongodb)}`);

  const demo = await fetchJson(`${apiOrigin}/api/demo-field`);
  record('demo_field_http', demo.status === 200, `status=${demo.status}`);
  record('canonical_field_id', demo.body?.field?._id === DEMO_FIELD_ID, demo.body?.field?._id);
  record('storage_mongodb', demo.body?.storage === 'MongoDB', demo.body?.storage);
  record('climate_2025_count', demo.body?.climateDaily?.length === 365, String(demo.body?.climateDaily?.length));
  record('crop_history_count', demo.body?.cropHistory?.length === 3, String(demo.body?.cropHistory?.length));
  record('soils_count', demo.body?.soils?.length === 26, String(demo.body?.soils?.length));
  record('irrigation_budget_null', demo.body?.field?.irrigation_budget_mm === null, String(demo.body?.field?.irrigation_budget_mm));

  const seasonal = await fetchJson(`${apiOrigin}/api/demo-field/climate-seasonal`);
  record('climate_seasonal', seasonal.status === 200 && seasonal.body?.semantics?.notForecast === true, `status=${seasonal.status}`);

  const scenarios = await fetchJson(`${apiOrigin}/api/demo-field/scenarios`);
  record('scenarios', scenarios.status === 200 && scenarios.body?.scenarios?.length >= 1, `count=${scenarios.body?.scenarios?.length}`);

  const profiles = await fetchJson(`${apiOrigin}/api/crop-profiles`);
  record('crop_profiles', profiles.status === 200 && profiles.body?.cropProfiles?.length === 8, `count=${profiles.body?.cropProfiles?.length}`);

  const compat = await fetchJson(`${apiOrigin}/api/crop-compatibility`);
  record('crop_compatibility', compat.status === 200 && compat.body?.note?.includes('not active'), 'ok');

  return { checks: report.checks.length };
}

async function writeReport(success, errorMessage) {
  report.passed = success;
  if (errorMessage) report.error = errorMessage;
  report.finishedAt = new Date().toISOString();
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'qa', 'evidence', 'batch07e');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'smoke-live.json'), JSON.stringify(report, null, 2));
}

async function main() {
  loadFieldshiftEnv();
  const result = await runLiveSmoke();
  await writeReport(true);
  console.log(`Live smoke PASS — ${result.checks} checks (API ${api.origin}, frontend ${frontendOrigin})`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch(async (err) => {
    await writeReport(false, err.message).catch(() => {});
    console.error('Live smoke FAILED:', err.message);
    console.error(`Configured API: ${api.origin}. Set PORT and FIELDSHIFT_API_PORT to the same backend that serves /api/health.`);
    process.exitCode = 1;
  });
}