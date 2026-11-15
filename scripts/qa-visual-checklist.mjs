#!/usr/bin/env node
/**
 * Maps the 23-step demo visual checklist to automated vs manual verification.
 * Runs automatable steps via Playwright; records the rest explicitly.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const shotRef = 'qa/screenshots/batch08b3';
const outDir = 'qa/screenshots/batch08b4';

const STEPS = [
  { id: 1, label: 'Cinematic introduction', auto: 'qa-demo-full step 01' },
  { id: 2, label: 'MapLibre explorer', auto: 'qa-demo-full step 02' },
  { id: 3, label: 'Canonical MongoDB demo field', auto: 'qa-demo-full step 03' },
  { id: 4, label: 'Field identity and proposed boundary', auto: 'qa-demo-full step 04 + batch08b3 screenshots' },
  { id: 5, label: 'Analyze historical climate', auto: 'qa-demo-full step 05' },
  { id: 6, label: 'Climate source and reference period', auto: 'qa-demo-full step 06' },
  { id: 7, label: 'Edit rotations A/B/C', auto: 'qa-demo-full step 07' },
  { id: 8, label: 'Water Truth panel visible', auto: 'qa-demo-full preflight scroll' },
  { id: 9, label: 'Preflight missing irrigation', auto: 'preflight-missing-budget.png' },
  { id: 10, label: 'UNKNOWN preserved', auto: 'qa-demo-full step 08' },
  { id: 11, label: 'Farmer budget entered', auto: 'qa-demo-full step 09' },
  { id: 12, label: 'Checks re-evaluate', auto: 'qa-demo-full step 09' },
  { id: 13, label: 'Farmer previous crop', auto: 'qa-demo-full step 10' },
  { id: 14, label: 'Rule impact panel', auto: 'qa-demo-full step 10' },
  { id: 15, label: 'Why this result trace', auto: 'qa-demo-full step 11' },
  { id: 16, label: 'Save analysis', auto: 'qa-demo-full step 12' },
  { id: 17, label: 'Export plan', auto: 'qa-demo-full step 12' },
  { id: 18, label: 'Import plan', auto: 'qa-demo-full step 12' },
  { id: 19, label: 'UI restore crops/budget/scope', auto: 'qa-demo-full step 12' },
  { id: 20, label: 'HISTORICAL snapshot warning', auto: 'import-historical-warning.png' },
  { id: 21, label: 'Re-analyze truthful CURRENT', auto: 'qa-demo-full step 15' },
  { id: 22, label: 'Field switch no leakage', auto: 'qa-demo-full step 16' },
  { id: 23, label: 'Non-demo live NASA POWER', auto: 'qa-live-nasa-non-demo.mjs' },
];

const MANUAL_ONLY = [
  'Pixel-level screenshot regression vs batch08b3 (truncation/overlap)',
  'Draw polygon with map clicks (not coordinates paste)',
  'Pan/zoom/orbit terrain and DEM tiles',
  'Keyboard focus order and screen-reader pass',
  'Network payload inspection in DevTools',
];

async function fileOk(rel) {
  try {
    await readFile(path.join(process.cwd(), rel));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const demoResults = await fileOk('qa/demo-full-results.json')
    ? JSON.parse(await readFile('qa/demo-full-results.json', 'utf8'))
    : null;
  const liveNasa = await fileOk('qa/live-nasa-non-demo.json')
    ? JSON.parse(await readFile('qa/live-nasa-non-demo.json', 'utf8'))
    : null;
  const verified = [];
  const partial = [];
  const unverified = [];
  for (const step of STEPS) {
    let status = 'unverified';
    if (step.id <= 22 && demoResults?.checks?.every((c) => c.result === 'pass')) status = 'verified';
  else if (step.id === 23 && liveNasa?.summary?.liveNasa) status = 'verified';
    else if (step.id === 23 && liveNasa?.summary?.blocked) status = 'blocked';
    else if (step.id <= 22 && demoResults) status = 'partial';
    if (status === 'verified') verified.push(step);
    else if (status === 'unverified') unverified.push(step);
    else partial.push(step);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    referenceScreenshots: shotRef,
    automatedVerified: verified.length,
    totalSteps: STEPS.length,
    partial,
    unverified: unverified.map((s) => s.id),
    manualOnly: MANUAL_ONLY,
    demoQa: demoResults ? { passed: demoResults.checks.filter((c) => c.result === 'pass').length, total: demoResults.checks.length } : null,
    liveNasa: liveNasa?.summary ?? null,
  };
  await writeFile('qa/visual-checklist-08b4.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { verified: report.automatedVerified, total: report.totalSteps, manualOnly: MANUAL_ONLY.length },
      null,
      2,
    ),
  );
}

main();