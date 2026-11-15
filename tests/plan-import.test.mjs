import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_IMPORT_MAX_BYTES,
  assertPlanImportByteSize,
  readSaved,
  utf8ByteLength,
} from '../src/domain.mjs';
import { buildAllDecisionTraces } from '../src/decision-trace.mjs';
import { buildDecisionSnapshot } from '../src/decision-snapshot.mjs';
import { runPreflight } from '../src/preflight.mjs';
import { emptyFarmerInputs, enginePreviousCrop, fieldScopeKey } from '../src/farmer-inputs.mjs';

const polygon = [
  [-103.61, 41.806],
  [-103.609, 41.806],
  [-103.609, 41.807],
  [-103.61, 41.807],
];

function largeDemoPlan() {
  const rotations = [['wheat', 'maize', 'wheat'], ['soy', 'sunflower', 'wheat'], ['chickpea', 'wheat', 'maize']];
  const farmerInputs = {
    fieldScope: fieldScopeKey({ polygon }),
    previousCrop: { cropId: 'maize', confirmed: true, provenance: 'farmer_assertion' },
  };
  const fieldContext = {
    polygon,
    areaHa: 22.19,
    previousCrop: enginePreviousCrop(farmerInputs),
    waterBudget: { amount: '150000', unit: 'm3', period: 'perSeason' },
    plantingDates: ['2025-04-15', '2025-04-15', '2025-04-15'],
    illustrativeCropSettings: true,
    effectiveRainfallSlopeConfirmed: true,
  };
  const traces = buildAllDecisionTraces(
    rotations.map((r) => runPreflight(r, fieldContext, null)),
    { context: fieldContext, farmerInputs, climateData: null, fieldScope: farmerInputs.fieldScope },
  );
  const snapshot = buildDecisionSnapshot({
    rotations,
    traces,
    farmerInputs,
    preflightInputs: {
      waterBudget: fieldContext.waterBudget,
      plantingDates: fieldContext.plantingDates,
      illustrativeCropSettings: true,
      effectiveRainfallSlopeConfirmed: true,
    },
    farmerImpact: { items: [] },
    fieldScope: farmerInputs.fieldScope,
    polygon,
    areaHa: fieldContext.areaHa,
    climateData: null,
  });
  return {
    version: 1,
    polygon,
    rotations,
    farmerInputs,
    previousCrop: 'maize',
    preflightInputs: {
      waterBudget: fieldContext.waterBudget,
      plantingDates: fieldContext.plantingDates,
      illustrativeCropSettings: true,
      effectiveRainfallSlopeConfirmed: true,
    },
    decisionSnapshot: snapshot,
    country: 'USA',
    scenario: 'ssp245',
    period: '2040-2059',
  };
}

test('valid plan above legacy 100 KB limit imports with farmer inputs intact', () => {
  const plan = largeDemoPlan();
  const json = JSON.stringify(plan, null, 2);
  const bytes = utf8ByteLength(json);
  assert.ok(bytes > 100_000, `expected >100 KB fixture, got ${bytes}`);
  assert.ok(bytes < PLAN_IMPORT_MAX_BYTES);
  assertPlanImportByteSize(bytes);
  const restored = readSaved(json);
  assert.equal(restored.farmerInputs.previousCrop.cropId, 'maize');
  assert.equal(restored.farmerInputs.previousCrop.confirmed, true);
  assert.equal(restored.farmerInputs.fieldScope, plan.farmerInputs.fieldScope);
  assert.ok(restored.decisionSnapshot);
});

test('oversized plan is rejected before JSON parse', () => {
  assert.throws(() => assertPlanImportByteSize(PLAN_IMPORT_MAX_BYTES + 1), (err) => err.code === 'plan-too-large');
});

test('malformed JSON is rejected by readSaved', () => {
  assert.throws(() => readSaved('{not-json'), (err) => err instanceof SyntaxError);
});

test('invalid version is rejected', () => {
  const plan = largeDemoPlan();
  plan.version = 2;
  assert.throws(() => readSaved(JSON.stringify(plan)), (err) => err.message === 'version');
});