import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_FIELD_ID } from '../src/demo-evidence.mjs';
import {
  buildDecisionSnapshot,
  reproduceFromSnapshot,
  materialEvaluationFingerprint,
  climateEvidenceDigest,
} from '../src/decision-snapshot.mjs';
import {
  SNAPSHOT_VALIDITY,
  resolveCanonicalDemoFieldId,
  assessSnapshotValidity,
  assessImportedSnapshotTrust,
  climateDigestsEqual,
} from '../src/decision-snapshot-validity.mjs';
import { ENGINE_TRACE_VERSION, traceFingerprint, buildAllDecisionTraces } from '../src/decision-trace.mjs';
import { runPreflight } from '../src/preflight.mjs';
import { emptyFarmerInputs, fieldScopeKey, enginePreviousCrop } from '../src/farmer-inputs.mjs';
import { readSaved } from '../src/domain.mjs';

const polygon = [
  [-103.61, 41.806],
  [-103.609, 41.806],
  [-103.609, 41.807],
  [-103.61, 41.807],
];

test('canonical demo field id resolves only from verified Mongo _id', () => {
  assert.equal(resolveCanonicalDemoFieldId({ _id: DEMO_FIELD_ID }), DEMO_FIELD_ID);
  assert.equal(resolveCanonicalDemoFieldId({ _id: DEMO_FIELD_ID, id: 'wrong' }), DEMO_FIELD_ID);
  assert.equal(resolveCanonicalDemoFieldId({ id: DEMO_FIELD_ID }), null);
  assert.equal(resolveCanonicalDemoFieldId({ _id: 'other' }), null);
});

test('snapshot records canonicalDemoFieldId for demo scope', () => {
  const fieldScope = `demo:${DEMO_FIELD_ID}`;
  const snap = buildDecisionSnapshot({
    rotations: [['wheat', 'maize', 'wheat']],
    traces: [],
    farmerInputs: emptyFarmerInputs(),
    preflightInputs: { waterBudget: { amount: '', unit: 'm3', period: 'perSeason' }, plantingDates: ['', '', ''], illustrativeCropSettings: false, effectiveRainfallSlopeConfirmed: false },
    fieldScope,
    demoFieldId: DEMO_FIELD_ID,
    polygon,
    areaHa: 22.22,
    climateData: null,
  });
  assert.equal(snap.field.canonicalDemoFieldId, DEMO_FIELD_ID);
  assert.equal(snap.field.demoFieldId, DEMO_FIELD_ID);
});

test('field scope change marks snapshot STALE', () => {
  const snap = buildDecisionSnapshot({
    rotations: [['wheat', 'maize', 'wheat']],
    traces: [],
    farmerInputs: emptyFarmerInputs(),
    fieldScope: `demo:${DEMO_FIELD_ID}`,
    demoFieldId: DEMO_FIELD_ID,
    polygon,
    areaHa: 22,
    climateData: null,
  });
  const otherScope = fieldScopeKey({ polygon: [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]] });
  const v = assessSnapshotValidity(snap, { fieldScope: otherScope, demoFieldId: null, hasCurrentEvaluation: false });
  assert.equal(v.state, SNAPSHOT_VALIDITY.STALE);
  assert.ok(v.reasons.includes('field_scope'));
});

test('material fingerprint changes when budget changes', () => {
  const base = {
    rotations: [['wheat', 'maize', 'wheat']],
    preflightInputs: { waterBudget: { amount: '100', unit: 'm3', period: 'perSeason' }, plantingDates: ['2025-04-15', '2025-04-15', '2025-04-15'], illustrativeCropSettings: true, effectiveRainfallSlopeConfirmed: true },
    farmerInputs: emptyFarmerInputs(),
    fieldScope: 'polygon:test',
    demoFieldId: null,
    areaHa: 10,
  };
  const a = materialEvaluationFingerprint(base);
  const b = materialEvaluationFingerprint({ ...base, preflightInputs: { ...base.preflightInputs, waterBudget: { amount: '200', unit: 'm3', period: 'perSeason' } } });
  assert.notEqual(a, b);
});

test('snapshot stores farmer impact after evaluation ordering', () => {
  const farmerInputs = {
    fieldScope: fieldScopeKey({ polygon }),
    previousCrop: { cropId: 'maize', confirmed: true, provenance: 'farmer_assertion' },
  };
  const fieldContext = {
    polygon,
    areaHa: 22,
    previousCrop: enginePreviousCrop(farmerInputs),
    waterBudget: { amount: '150000', unit: 'm3', period: 'perSeason' },
    plantingDates: ['2025-04-15', '2025-04-15', '2025-04-15'],
    illustrativeCropSettings: true,
    effectiveRainfallSlopeConfirmed: true,
  };
  const evaluations = [['wheat', 'maize', 'wheat']].map((r) => runPreflight(r, fieldContext, null));
  const traces = buildAllDecisionTraces(evaluations, { context: fieldContext, farmerInputs, climateData: null, fieldScope: farmerInputs.fieldScope });
  const impact = { items: [{ ruleId: 'water.budget', from: 'UNKNOWN', to: 'PASS' }], overallStatus: null };
  const snap = buildDecisionSnapshot({ rotations: [['wheat', 'maize', 'wheat']], traces, farmerInputs, preflightInputs: fieldContext, farmerImpact: impact, fieldScope: farmerInputs.fieldScope, polygon, areaHa: 22, climateData: null });
  assert.equal(snap.farmerImpact.items[0].to, 'PASS');
});

test('identical inputs yield identical trace fingerprints', () => {
  const ctx = { polygon, areaHa: 22, previousCrop: null, waterBudget: { amount: '', unit: 'm3', period: 'perSeason' }, plantingDates: ['', '', ''], illustrativeCropSettings: false, effectiveRainfallSlopeConfirmed: false };
  const a = traceFingerprint(buildAllDecisionTraces([runPreflight(['wheat', 'maize', 'wheat'], ctx, null)], { context: ctx, farmerInputs: emptyFarmerInputs(), climateData: null }));
  const b = traceFingerprint(buildAllDecisionTraces([runPreflight(['wheat', 'maize', 'wheat'], ctx, null)], { context: ctx, farmerInputs: emptyFarmerInputs(), climateData: null }));
  assert.equal(a, b);
});

test('climate digest detects material evidence change', () => {
  const d1 = climateEvidenceDigest({ storage: 'MongoDB', source: 'NASA POWER', period: { startIso: '2025-01-01', endIso: '2025-12-31' }, planning: { precipitationAnnualMm: 394 } });
  const d2 = climateEvidenceDigest({ storage: 'MongoDB', source: 'NASA POWER', period: { startIso: '2025-01-01', endIso: '2025-12-31' }, planning: { precipitationAnnualMm: 500 } });
  assert.equal(climateDigestsEqual(d1, d1), true);
  assert.equal(climateDigestsEqual(d1, d2), false);
});

test('engine version mismatch import keeps plan but marks UNREPRODUCIBLE', () => {
  const plan = {
    version: 1,
    polygon,
    rotations: [['wheat', 'maize', 'wheat'], ['soy', 'sunflower', 'wheat'], ['chickpea', 'wheat', 'maize']],
    country: 'USA',
    scenario: 'ssp245',
    period: '2040-2059',
    farmerInputs: emptyFarmerInputs(),
    decisionSnapshot: {
      version: 1,
      engineTraceVersion: 'fieldshift-old',
      rotations: [['wheat', 'maize', 'wheat'], ['soy', 'sunflower', 'wheat'], ['chickpea', 'wheat', 'maize']],
      traces: [],
    },
  };
  const restored = readSaved(JSON.stringify(plan));
  assert.equal(restored.decisionSnapshotTrust.state, SNAPSHOT_VALIDITY.UNREPRODUCIBLE);
});

test('reproduceFromSnapshot reports engine mismatch without throwing', () => {
  const snap = buildDecisionSnapshot({ rotations: [['wheat', 'maize', 'wheat']], traces: [], farmerInputs: emptyFarmerInputs(), polygon, areaHa: 22, climateData: null });
  snap.engineTraceVersion = 'fieldshift-old';
  const r = reproduceFromSnapshot(snap, { polygon, areaHa: 22, waterBudget: { amount: '', unit: 'm3', period: 'perSeason' }, plantingDates: ['', '', ''], illustrativeCropSettings: false, effectiveRainfallSlopeConfirmed: false, previousCrop: null }, null);
  assert.equal(r.engineMismatch, true);
});

test('import preserves farmer inputs and field scope on large plan', () => {
  const farmerInputs = { fieldScope: fieldScopeKey({ polygon }), previousCrop: { cropId: 'maize', confirmed: true, provenance: 'farmer_assertion' } };
  const plan = {
    version: 1,
    polygon,
    rotations: [['wheat', 'maize', 'wheat'], ['soy', 'sunflower', 'wheat'], ['chickpea', 'wheat', 'maize']],
    farmerInputs,
    country: 'USA',
    scenario: 'ssp245',
    period: '2040-2059',
    preflightInputs: { waterBudget: { amount: '150000', unit: 'm3', period: 'perSeason' }, plantingDates: ['2025-04-15', '2025-04-15', '2025-04-15'], illustrativeCropSettings: true, effectiveRainfallSlopeConfirmed: true },
    decisionSnapshot: buildDecisionSnapshot({
      rotations: [['wheat', 'maize', 'wheat'], ['soy', 'sunflower', 'wheat'], ['chickpea', 'wheat', 'maize']],
      traces: [],
      farmerInputs,
      preflightInputs: { waterBudget: { amount: '150000', unit: 'm3', period: 'perSeason' }, plantingDates: ['2025-04-15', '2025-04-15', '2025-04-15'], illustrativeCropSettings: true, effectiveRainfallSlopeConfirmed: true },
      fieldScope: farmerInputs.fieldScope,
      demoFieldId: null,
      polygon,
      areaHa: 22,
      climateData: null,
    }),
  };
  const restored = readSaved(JSON.stringify(plan));
  assert.equal(restored.farmerInputs.previousCrop.cropId, 'maize');
  assert.equal(restored.farmerInputs.fieldScope, farmerInputs.fieldScope);
  assert.equal(restored.decisionSnapshotTrust.state, SNAPSHOT_VALIDITY.HISTORICAL);
});

test('CURRENT requires matching live evaluation context', () => {
  const snap = buildDecisionSnapshot({
    rotations: [['wheat', 'maize', 'wheat']],
    traces: [],
    farmerInputs: emptyFarmerInputs(),
    fieldScope: fieldScopeKey({ polygon }),
    polygon,
    areaHa: 22,
    climateData: null,
  });
  const fp = snap.evaluationInputs.fingerprint;
  const live = { fieldScope: snap.field.fieldScope, demoFieldId: null, materialFingerprint: fp, hasCurrentEvaluation: true, climateDigest: snap.climate.evidenceDigest };
  assert.equal(assessSnapshotValidity(snap, live).state, SNAPSHOT_VALIDITY.CURRENT);
});

test('Arabic and English snapshot validity messages exist', async () => {
  const { messages } = await import('../src/i18n.mjs');
  for (const state of Object.keys(SNAPSHOT_VALIDITY)) {
    assert.ok(messages.en.snapshotValidity[state]);
    assert.ok(messages.ar.snapshotValidity[state]);
  }
});

test('missing archived climate marks unreproducible assessment path', () => {
  const snap = buildDecisionSnapshot({ rotations: [['wheat', 'maize', 'wheat']], traces: [], farmerInputs: emptyFarmerInputs(), polygon, areaHa: 22, climateData: null });
  const live = { fieldScope: snap.field.fieldScope, materialFingerprint: snap.evaluationInputs.fingerprint, hasCurrentEvaluation: false, climateDigest: { kind: 'none', reproducible: false } };
  const v = assessSnapshotValidity(snap, live);
  assert.notEqual(v.state, SNAPSHOT_VALIDITY.CURRENT);
});

test('assessImportedSnapshotTrust rejects untrusted demo identity', () => {
  const snap = {
    version: 1,
    engineTraceVersion: ENGINE_TRACE_VERSION,
    rotations: [[]],
    traces: [],
    field: { fieldScope: `demo:${DEMO_FIELD_ID}`, demoFieldId: 'not-canonical' },
  };
  const t = assessImportedSnapshotTrust(snap, { farmerInputs: { fieldScope: `demo:${DEMO_FIELD_ID}` } });
  assert.equal(t.state, SNAPSHOT_VALIDITY.UNREPRODUCIBLE);
});