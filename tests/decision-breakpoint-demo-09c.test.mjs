import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptDemoEvidence } from '../src/demo-evidence.mjs';
import { areaHa } from '../src/domain.mjs';
import { runPreflight } from '../src/preflight.mjs';
import { analyzeDecisionSensitivity } from '../src/decision-breakpoint.mjs';

const root = new URL('../backend/.local/canonical/', import.meta.url);
const load = async (name) =>
  (await readFile(new URL(`${name}.jsonl`, root), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);

async function scottsbluffContext() {
  const field = (await load('fields'))[0];
  const climateDaily = (await load('climate_daily')).filter((r) => r.date.startsWith('2025'));
  const selected = adaptDemoEvidence({
    storage: 'MongoDB',
    field,
    climateDaily,
    cropHistory: await load('crop_history'),
    soils: await load('field_soils'),
  });
  const polygon = selected.polygon;
  return {
    climate: selected.climate,
    context: {
      polygon,
      areaHa: areaHa(polygon),
      waterBudget: { amount: '', unit: 'mm', period: 'perSeason' },
      plantingDates: ['2025-04-20', '2025-05-01', '2025-05-15'],
      illustrativeCropSettings: true,
      effectiveRainfallSlopeConfirmed: true,
      previousCrop: null,
    },
    rotations: [['wheat', 'soy', 'wheat']],
  };
}

function balanceStatus(evaluation, season = 1) {
  return evaluation.checks.find((c) => c.ruleId === 'water.balance' && c.season === season)?.status;
}

test('Scottsbluff demo yields decision-sensitive season-1 water.balance threshold', async () => {
  const { climate, context, rotations } = await scottsbluffContext();
  const sensitivity = analyzeDecisionSensitivity(rotations, context, climate, {
    testedBudgetRange: { min: 0, max: 500_000, unit: 'm3', period: 'perSeason' },
  });
  const finding = sensitivity.findings.find(
    (f) => f.rotationIndex === 0 && f.season === 1 && f.ruleId === 'water.balance',
  );
  assert.equal(finding?.classification, 'DECISION-SENSITIVE');
  assert.ok(finding.threshold.mm > 600);
  assert.ok(finding.threshold.m3 > 100_000);

  const below = runPreflight(rotations[0], { ...context, waterBudget: { amount: '622', unit: 'mm', period: 'perSeason' } }, climate);
  const at = runPreflight(rotations[0], { ...context, waterBudget: { amount: '623.86', unit: 'mm', period: 'perSeason' } }, climate);
  const above = runPreflight(rotations[0], { ...context, waterBudget: { amount: '624', unit: 'mm', period: 'perSeason' } }, climate);

  assert.equal(balanceStatus(below), 'WARNING');
  assert.equal(balanceStatus(at), 'PASS');
  assert.equal(balanceStatus(above), 'PASS');
  assert.equal(below.status, 'UNKNOWN');
  assert.ok(below.checks.some((c) => c.status === 'UNKNOWN'));
});