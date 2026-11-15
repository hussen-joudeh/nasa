import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enginePreviousCrop,
  emptyFarmerInputs,
  fieldScopeKey,
  migrateLegacyPreviousCrop,
  normalizeFarmerInputs,
  summarizeFarmerImpact,
  validateWaterBudgetDraft,
} from '../src/farmer-inputs.mjs';
import { evaluateRotation } from '../src/domain.mjs';
import { readSaved } from '../src/domain.mjs';

const polygon = [
  [0, 0],
  [0.01, 0],
  [0.01, 0.01],
];

test('unconfirmed previous crop does not affect rotation.history', () => {
  const draft = normalizeFarmerInputs({
    previousCrop: { cropId: 'maize', confirmed: false },
  });
  assert.equal(enginePreviousCrop(draft), null);
  const b = evaluateRotation(['wheat', 'soy', 'sunflower'], { previousCrop: enginePreviousCrop(draft) });
  assert.equal(b.checks.find((c) => c.id === 'history').result, 'UNKNOWN');
});

test('confirmed previous crop affects only rotation.history', () => {
  const confirmed = normalizeFarmerInputs({
    previousCrop: { cropId: 'maize', confirmed: true, provenance: 'farmer_assertion' },
  });
  assert.equal(enginePreviousCrop(confirmed), 'maize');
  const evaluation = evaluateRotation(['wheat', 'soy', 'sunflower'], { previousCrop: 'maize' });
  assert.equal(evaluation.checks.find((c) => c.id === 'history').result, 'WARNING');
  assert.equal(evaluation.checks.find((c) => c.id === 'compatibility').result, 'UNKNOWN');
});

test('invalid budget rejected; empty budget stays UNKNOWN', () => {
  assert.equal(validateWaterBudgetDraft({ amount: '-5', unit: 'm3', period: 'perSeason' }).valid, false);
  assert.equal(validateWaterBudgetDraft({ amount: '', unit: 'm3', period: 'perSeason' }).empty, true);
});

test('field scope isolates saved farmer inputs', () => {
  const scopeA = fieldScopeKey({ polygon });
  const scopeB = fieldScopeKey({ polygon: [...polygon, [0.02, 0.01]] });
  const saved = normalizeFarmerInputs(
    { fieldScope: scopeA, previousCrop: { cropId: 'soy', confirmed: true, provenance: 'farmer_assertion' } },
    scopeB,
  );
  assert.equal(saved.previousCrop.confirmed, false);
  assert.equal(saved.previousCrop.cropId, null);
});

test('legacy previousCrop migrates on read when scope matches', () => {
  const plan = {
    version: 1,
    polygon,
    rotations: [
      ['wheat', 'maize', 'wheat'],
      ['wheat', 'soy', 'sunflower'],
      ['chickpea', 'wheat', 'soy'],
    ],
    country: 'USA',
    scenario: 'ssp245',
    period: '2040-2059',
    previousCrop: 'chickpea',
  };
  const parsed = readSaved(JSON.stringify(plan));
  const migrated = migrateLegacyPreviousCrop(parsed, fieldScopeKey({ polygon }));
  assert.equal(migrated.previousCrop.confirmed, true);
  assert.equal(enginePreviousCrop(migrated), 'chickpea');
});

test('farmer budget impact can change water.budget status', () => {
  const rotation = ['maize', 'maize', 'maize'];
  const impact = summarizeFarmerImpact({
    rotation,
    fieldContext: { areaHa: 10, illustrativeCropSettings: true, effectiveRainfallSlopeConfirmed: true, plantingDates: ['', '', ''] },
    climateData: null,
    beforeBudget: { amount: '', unit: 'm3', period: 'perSeason' },
    afterBudget: { amount: '5000', unit: 'm3', period: 'perSeason' },
  });
  const budgetChange = impact.items.find((i) => i.ruleId === 'water.budget');
  assert.ok(budgetChange);
  assert.equal(budgetChange.from, 'UNKNOWN');
  assert.equal(budgetChange.to, 'PASS');
});