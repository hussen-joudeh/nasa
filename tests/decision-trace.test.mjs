import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../src/preflight.mjs';
import {
  buildDecisionTrace,
  buildAllDecisionTraces,
  traceFingerprint,
  farmerChangeRecords,
  ENGINE_TRACE_VERSION,
} from '../src/decision-trace.mjs';
import { buildDecisionSnapshot, reproduceFromSnapshot } from '../src/decision-snapshot.mjs';
import { enginePreviousCrop, emptyFarmerInputs, summarizeFarmerImpact } from '../src/farmer-inputs.mjs';
import { DEMO_FIELD_ID } from '../src/demo-evidence.mjs';
import { adaptDemoEvidence } from '../src/demo-evidence.mjs';

const polygon = [
  [0, 0],
  [0.01, 0],
  [0.01, 0.01],
  [0, 0.01],
];
const fieldContext = {
  polygon,
  areaHa: 1.01,
  previousCrop: null,
  waterBudget: { amount: '', unit: 'm3', period: 'perSeason' },
  plantingDates: ['2025-06-01', '2025-06-01', '2025-06-01'],
  illustrativeCropSettings: true,
  effectiveRainfallSlopeConfirmed: true,
};

test('identical inputs yield identical trace fingerprints', () => {
  const rotation = ['wheat', 'soy', 'sunflower'];
  const a = runPreflight(rotation, fieldContext, null);
  const b = runPreflight(rotation, fieldContext, null);
  const meta = { context: fieldContext, fieldScope: 'polygon:test', farmerInputs: emptyFarmerInputs(), climateData: null };
  const fa = traceFingerprint(buildAllDecisionTraces([a], meta));
  const fb = traceFingerprint(buildAllDecisionTraces([b], meta));
  assert.equal(fa, fb);
});

test('water.field-area provenance is boundary geometry not climate', () => {
  const evaluation = runPreflight(['wheat', 'soy', 'sunflower'], fieldContext, null);
  const trace = buildDecisionTrace(evaluation, { context: fieldContext, farmerInputs: emptyFarmerInputs(), climateData: null, rotationIndex: 0 });
  const area = trace.checks.find((c) => c.ruleId === 'water.field-area');
  assert.ok(area);
  assert.equal(area.inputProvenance.kind, 'geometry');
  assert.equal(area.inputProvenance.directCalculationInput, true);
});

test('confirmed previous crop trace flags farmer_assertion on rotation.history only', () => {
  const farmerInputs = {
    fieldScope: 'polygon:test',
    previousCrop: { cropId: 'maize', confirmed: true, provenance: 'farmer_assertion' },
  };
  const context = { ...fieldContext, previousCrop: enginePreviousCrop(farmerInputs) };
  const evaluation = runPreflight(['wheat', 'soy', 'sunflower'], context, null);
  const trace = buildDecisionTrace(evaluation, { context, farmerInputs, climateData: null, rotationIndex: 0 });
  const history = trace.checks.find((c) => c.ruleId === 'rotation.history');
  assert.equal(history.inputProvenance.kind, 'farmer_assertion');
  assert.equal(history.inputProvenance.directCalculationInput, true);
  assert.notEqual(trace.checks.find((c) => c.ruleId === 'rotation.compatibility').inputProvenance.directCalculationInput, true);
});

test('budget change affects only water budget trace status', () => {
  const rotation = ['wheat', 'maize', 'wheat'];
  const impact = summarizeFarmerImpact({
    rotation,
    fieldContext,
    climateData: null,
    beforeBudget: { amount: '', unit: 'm3', period: 'perSeason' },
    afterBudget: { amount: '100', unit: 'm3', period: 'perSeason' },
  });
  const records = farmerChangeRecords(impact);
  assert.ok(records.some((r) => r.ruleId === 'water.budget' && r.from === 'UNKNOWN' && r.to === 'PASS'));
  assert.ok(records.every((r) => r.provenance === 'farmer_assertion'));
  assert.ok(!records.some((r) => r.ruleId === 'rotation.compatibility'));
});

test('snapshot reproduces fingerprint for fixed context', () => {
  const rotations = [
    ['wheat', 'soy', 'sunflower'],
    ['wheat', 'maize', 'wheat'],
    ['chickpea', 'wheat', 'soy'],
  ];
  const evaluations = rotations.map((r) => runPreflight(r, fieldContext, null));
  const traces = buildAllDecisionTraces(evaluations, { context: fieldContext, farmerInputs: emptyFarmerInputs(), climateData: null });
  const snapshot = buildDecisionSnapshot({
    rotations,
    traces,
    farmerInputs: emptyFarmerInputs(),
    preflightInputs: { waterBudget: fieldContext.waterBudget, plantingDates: fieldContext.plantingDates },
    fieldScope: 'polygon:test',
    polygon,
    areaHa: 1.01,
    climateData: null,
  });
  assert.equal(snapshot.engineTraceVersion, ENGINE_TRACE_VERSION);
  const again = reproduceFromSnapshot(snapshot, fieldContext, null);
  assert.equal(again.matches, true);
});

function demoFixture() {
  return {
    storage: 'MongoDB',
    field: {
      _id: DEMO_FIELD_ID,
      field_id: DEMO_FIELD_ID,
      approval_status: 'proposed',
      area_ha: 22.220372,
      geometry: {
        type: 'Polygon',
        coordinates: [[[-103.61, 41.8], [-103.6, 41.8], [-103.6, 41.81], [-103.61, 41.8]]],
      },
      centroid: { type: 'Point', coordinates: [-103.605, 41.805] },
    },
    cropHistory: Array.from({ length: 3 }, () => ({ field_id: DEMO_FIELD_ID })),
    soils: Array.from({ length: 26 }, () => ({ field_id: DEMO_FIELD_ID })),
    climateDaily: Array.from({ length: 365 }, (_, i) => ({
      field_id: DEMO_FIELD_ID,
      date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
      time_standard: 'LST',
      precip_mm: 1,
      tmin_c: 10,
      tmax_c: 20,
      solar_kwh_m2_day: 2,
      source: { product: 'NASA POWER Daily Point AG', time_standard: 'LST', response_header: { start: '20230101', end: '20251231', fill_value: -999 } },
    })),
  };
}

test('demo MongoDB climate trace marks stored_daily provenance', () => {
  const adapted = adaptDemoEvidence(demoFixture());
  assert.equal(adapted.climate.storage, 'MongoDB');
  const evaluation = runPreflight(['wheat', 'soy', 'sunflower'], { ...fieldContext, polygon: adapted.polygon, areaHa: 22.220372 }, adapted.climate);
  const trace = buildDecisionTrace(evaluation, {
    context: fieldContext,
    climateData: adapted.climate,
    demoFieldId: DEMO_FIELD_ID,
    fieldScope: `demo:${DEMO_FIELD_ID}`,
    rotationIndex: 0,
  });
  assert.equal(trace.climate.provenance.kind, 'stored_daily');
  assert.ok(trace.checks.some((c) => c.ruleId.startsWith('water.') && c.inputProvenance.field === 'climateDaily' || c.ruleId === 'water.climate-support'));
});