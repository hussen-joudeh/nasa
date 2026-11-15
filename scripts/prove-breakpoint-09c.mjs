#!/usr/bin/env node
/**
 * Batch 09C — compute Decision Breakpoint threshold for Scottsbluff demo using canonical Mongo fixture + live engines only.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { adaptDemoEvidence } from '../src/demo-evidence.mjs';
import { areaHa } from '../src/domain.mjs';
import { runPreflight } from '../src/preflight.mjs';
import { analyzeDecisionSensitivity } from '../src/decision-breakpoint.mjs';

const root = new URL('../backend/.local/canonical/', import.meta.url);
const load = async (name) =>
  (await readFile(new URL(`${name}.jsonl`, root), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);

async function main() {
  const field = (await load('fields'))[0];
  const climateDaily = (await load('climate_daily')).filter((r) => r.date.startsWith('2025'));
  const payload = {
    storage: 'MongoDB',
    field,
    climateDaily,
    cropHistory: await load('crop_history'),
    soils: await load('field_soils'),
  };
  const selected = adaptDemoEvidence(payload);
  const polygon = selected.polygon;
  const climate = selected.climate;
  const rotations = [['wheat', 'soy', 'wheat']];
  const plantingDates = ['2025-04-20', '2025-05-01', '2025-05-15'];
  const context = {
    polygon,
    areaHa: areaHa(polygon),
    waterBudget: { amount: '', unit: 'm3', period: 'perSeason' },
    plantingDates,
    illustrativeCropSettings: true,
    effectiveRainfallSlopeConfirmed: true,
    previousCrop: null,
  };

  const baseline = runPreflight(rotations[0], context, climate);
  const season1 = baseline.water.seasons.find((s) => s.season === 1);
  const sensitivity = analyzeDecisionSensitivity(rotations, context, climate, {
    testedBudgetRange: { min: 0, max: 500_000, unit: 'm3', period: 'perSeason' },
  });
  const finding = sensitivity.findings.find(
    (f) => f.rotationIndex === 0 && f.season === 1 && f.ruleId === 'water.balance',
  );

  if (!finding?.threshold?.m3) {
    console.error(JSON.stringify({ ok: false, reason: 'no_decision_sensitive_finding', baseline: baseline.status }, null, 2));
    process.exitCode = 1;
    return;
  }

  const thresholdM3 = finding.threshold.m3;
  const thresholdMm = finding.threshold.mm;
  const statusWithMm = (mm) =>
    runPreflight(rotations[0], { ...context, waterBudget: { amount: String(mm), unit: 'mm', period: 'perSeason' } }, climate)
      .checks.find((c) => c.ruleId === 'water.balance' && c.season === 1)?.status ?? 'UNKNOWN';

  const report = {
    ok: true,
    field: {
      id: field._id,
      approval: field.approval_status,
      areaHaStored: field.area_ha,
      areaHaCalculated: context.areaHa,
      centroid: field.centroid?.coordinates,
      elevationM: climate.coordinates?.elevation ?? null,
    },
    climate: {
      source: 'MongoDB archive · NASA POWER daily',
      period: climate.period,
      precipAnnualMm: climate.planning?.precipitationAnnualMm ?? climate.channels?.precipitation?.summary?.sum,
      notForecast: true,
    },
    assumptions: {
      rotationA: rotations[0],
      plantingDates,
      illustrativeCropSettings: true,
      effectiveRainfallSlopeConfirmed: true,
      previousCrop: null,
      labels: 'Illustrative FAO-56 crop settings; spring planting within 2025 historical window — not farmer-confirmed.',
    },
    threshold: { mm: thresholdMm, m3: thresholdM3, inclusive: finding.threshold.inclusive ?? true, ruleId: 'water.balance', season: 1, crop: 'wheat' },
    probesMm: {
      below: { amountMm: 622, status: statusWithMm(622) },
      at: { amountMm: thresholdMm, status: statusWithMm(thresholdMm) },
      above: { amountMm: 624, status: statusWithMm(624) },
    },
    demoScriptBudgetMm: { below: 622, at: 623.86, above: 624 },
    findingClassification: finding.classification,
    transitions: finding.transitions,
    season1Need: season1?.needMm,
    overallStatusBaseline: baseline.status,
    unresolvedChecks: baseline.checks.filter((c) => c.status === 'UNKNOWN').map((c) => ({ ruleId: c.ruleId, season: c.season })),
    overallAfterAtThreshold: runPreflight(rotations[0], { ...context, waterBudget: { amount: String(thresholdMm), unit: 'mm', period: 'perSeason' } }, climate).status,
  };

  await mkdir('qa', { recursive: true });
  await writeFile('qa/breakpoint-proof-09c.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();