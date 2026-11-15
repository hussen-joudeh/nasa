import { crops, evaluateRotation } from './domain.mjs';
import { runPreflight } from './preflight.mjs';
import { estimateWaterTruth } from './water-truth.mjs';

const knownCrop = (id) => typeof id === 'string' && Object.hasOwn(crops, id);

export function fieldScopeKey({ demoFieldId = null, polygon = null } = {}) {
  if (typeof demoFieldId === 'string' && demoFieldId) return `demo:${demoFieldId}`;
  if (Array.isArray(polygon) && polygon.length >= 3) {
    return `polygon:${polygon.map((p) => p.map((n) => Number(n).toFixed(6)).join(',')).join('|')}`;
  }
  return null;
}

export function emptyFarmerInputs() {
  return {
    fieldScope: null,
    previousCrop: { cropId: null, confirmed: false, provenance: null },
  };
}

export function normalizeFarmerInputs(value, activeScope = null) {
  const base = emptyFarmerInputs();
  if (!value || typeof value !== 'object') {
    return activeScope ? { ...base, fieldScope: activeScope } : base;
  }
  const pc = value.previousCrop && typeof value.previousCrop === 'object' ? value.previousCrop : {};
  if (knownCrop(pc.cropId)) base.previousCrop.cropId = pc.cropId;
  base.previousCrop.confirmed = pc.confirmed === true && knownCrop(pc.cropId);
  base.previousCrop.provenance = base.previousCrop.confirmed ? 'farmer_assertion' : null;
  const scope = typeof value.fieldScope === 'string' ? value.fieldScope : activeScope;
  if (activeScope && scope && scope !== activeScope) return { ...emptyFarmerInputs(), fieldScope: activeScope };
  base.fieldScope = scope ?? activeScope;
  return base;
}

export function migrateLegacyPreviousCrop(plan, activeScope) {
  if (plan?.farmerInputs) return normalizeFarmerInputs(plan.farmerInputs, activeScope);
  if (plan?.previousCrop && knownCrop(plan.previousCrop)) {
    return normalizeFarmerInputs(
      {
        fieldScope: activeScope,
        previousCrop: { cropId: plan.previousCrop, confirmed: true, provenance: 'farmer_assertion' },
      },
      activeScope,
    );
  }
  return normalizeFarmerInputs(null, activeScope);
}

export function enginePreviousCrop(farmerInputs) {
  const pc = farmerInputs?.previousCrop;
  return pc?.confirmed === true && knownCrop(pc.cropId) ? pc.cropId : null;
}

export function validateWaterBudgetDraft(budget) {
  if (!budget || typeof budget !== 'object') return { valid: true, error: null, empty: true };
  const raw = budget.amount;
  const text = typeof raw === 'string' ? raw.trim() : raw;
  if (text === '' || raw === null || raw === undefined) return { valid: true, error: null, empty: true };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return { valid: false, error: 'invalid_budget_amount', empty: false };
  if (!['mm', 'm3'].includes(budget.unit) || !['perSeason', 'wholePlan'].includes(budget.period)) {
    return { valid: false, error: 'invalid_budget_unit_or_period', empty: false };
  }
  return { valid: true, error: null, empty: false, amount, unit: budget.unit, period: budget.period };
}

export function waterBudgetProvenance(budget) {
  const check = validateWaterBudgetDraft(budget);
  if (check.empty) return { provided: false, source: null, storedDatabaseValue: null };
  return { provided: check.valid, source: check.valid ? 'farmer_assertion' : null, storedDatabaseValue: null };
}

function checkStatus(checks, ruleId) {
  const hit = checks.find((c) => c.ruleId === ruleId || c.id === ruleId.replace('rotation.', ''));
  return hit ? hit.status ?? hit.result ?? null : null;
}

export function summarizeFarmerImpact({
  rotation,
  fieldContext,
  climateData,
  beforePreviousCrop = null,
  afterPreviousCrop = null,
  beforeBudget = null,
  afterBudget = null,
}) {
  const items = [];
  const rotBefore = evaluateRotation(rotation, { ...fieldContext, previousCrop: beforePreviousCrop }, climateData);
  const rotAfter = evaluateRotation(rotation, { ...fieldContext, previousCrop: afterPreviousCrop }, climateData);
  const historyBefore = rotBefore.checks.find((c) => c.id === 'history');
  const historyAfter = rotAfter.checks.find((c) => c.id === 'history');
  if (historyBefore?.result !== historyAfter?.result) {
    items.push({
      domain: 'rotation',
      ruleId: 'rotation.history',
      from: historyBefore?.result ?? 'UNKNOWN',
      to: historyAfter?.result ?? 'UNKNOWN',
      inputChanged: 'farmerInputs.previousCrop.confirmed',
      provenance: 'farmer_assertion',
      noteKey: 'previousCrop',
    });
  }
  const waterBefore = estimateWaterTruth(rotation, { ...fieldContext, waterBudget: beforeBudget }, climateData);
  const waterAfter = estimateWaterTruth(rotation, { ...fieldContext, waterBudget: afterBudget }, climateData);
  for (const ruleId of ['water.budget', 'water.balance', 'water.plan-balance']) {
    const from = checkStatus(waterBefore.checks, ruleId);
    const to = checkStatus(waterAfter.checks, ruleId);
    if (from !== to)
      items.push({
        domain: 'water',
        ruleId,
        from: from ?? 'UNKNOWN',
        to: to ?? 'UNKNOWN',
        inputChanged: 'preflightInputs.waterBudget',
        provenance: 'farmer_assertion',
        noteKey: 'budget',
      });
  }
  const preBefore = runPreflight(rotation, { ...fieldContext, previousCrop: beforePreviousCrop, waterBudget: beforeBudget }, climateData);
  const preAfter = runPreflight(rotation, { ...fieldContext, previousCrop: afterPreviousCrop, waterBudget: afterBudget }, climateData);
  const overallFrom = preBefore.status;
  const overallTo = preAfter.status;
  return {
    items,
    overallStatus: { from: overallFrom, to: overallTo },
    unchangedUnknown: preAfter.checks.filter((c) => c.status === 'UNKNOWN').map((c) => c.ruleId),
  };
}

export function validateSavedFarmerInputs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('farmer');
  if (value.fieldScope !== null && typeof value.fieldScope !== 'string') throw Error('farmer');
  const pc = value.previousCrop;
  if (!pc || typeof pc !== 'object') throw Error('farmer');
  if (pc.cropId !== null && !knownCrop(pc.cropId)) throw Error('farmer');
  if (pc.confirmed !== false && pc.confirmed !== true) throw Error('farmer');
  if (pc.confirmed && !knownCrop(pc.cropId)) throw Error('farmer');
}