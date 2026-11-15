import { DEMO_FIELD_ID } from './demo-evidence.mjs';
import { ENGINE_TRACE_VERSION } from './decision-trace.mjs';
import { enginePreviousCrop } from './farmer-inputs.mjs';

export const SNAPSHOT_VALIDITY = {
  CURRENT: 'CURRENT',
  STALE: 'STALE',
  HISTORICAL: 'HISTORICAL',
  UNREPRODUCIBLE: 'UNREPRODUCIBLE',
};

/** Canonical MongoDB demo id when and only when the live selection carries the verified _id. */
export function resolveCanonicalDemoFieldId(demoFieldRecord) {
  const id = demoFieldRecord?._id;
  if (typeof id !== 'string' || id !== DEMO_FIELD_ID) return null;
  return id;
}

export function climateEvidenceDigest(climateData) {
  if (!climateData) {
    return { kind: 'none', reproducible: false };
  }
  const period = climateData.period ?? {};
  const planning = climateData.planning ?? {};
  return {
    kind: climateData.storage === 'MongoDB' ? 'stored_daily' : climateData.source === 'NASA POWER' ? 'live_nasa_power' : 'unknown',
    storage: climateData.storage ?? null,
    source: climateData.source ?? null,
    periodStart: period.startIso ?? null,
    periodEnd: period.endIso ?? null,
    timeStandard: climateData.timeStandard ?? null,
    fieldId: climateData.fieldId ?? null,
    dayCount: climateData.missing?.count != null ? 365 - Number(climateData.missing.count) : climateData.daily?.length ?? null,
    precipAnnualMm: planning.precipitationAnnualMm ?? null,
    tempMaxMeanC: planning.temperatureMeanMaxC ?? null,
    tempMinMeanC: planning.temperatureMeanMinC ?? null,
    reproducible: climateData.storage === 'MongoDB' || climateData.source === 'NASA POWER',
  };
}

export function materialEvaluationFingerprint({
  rotations,
  preflightInputs,
  farmerInputs,
  fieldScope,
  demoFieldId,
  areaHa,
}) {
  const budget = preflightInputs?.waterBudget ?? {};
  const payload = {
    rotations: (rotations ?? []).map((r) => [...r]),
    fieldScope: fieldScope ?? null,
    canonicalDemoFieldId: demoFieldId === DEMO_FIELD_ID ? demoFieldId : null,
    areaHa: areaHa ?? null,
    previousCrop: enginePreviousCrop(farmerInputs),
    previousCropConfirmed: farmerInputs?.previousCrop?.confirmed === true,
    waterBudget: {
      amount: String(budget.amount ?? '').trim(),
      unit: budget.unit ?? 'm3',
      period: budget.period ?? 'perSeason',
    },
    plantingDates: Array.isArray(preflightInputs?.plantingDates) ? [...preflightInputs.plantingDates] : ['', '', ''],
    illustrativeCropSettings: preflightInputs?.illustrativeCropSettings === true,
    effectiveRainfallSlopeConfirmed: preflightInputs?.effectiveRainfallSlopeConfirmed === true,
  };
  return JSON.stringify(payload);
}

export function climateDigestsEqual(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Determine trust state for a saved snapshot relative to the live session. */
export function assessSnapshotValidity(snapshot, live = {}) {
  if (!snapshot) return { state: SNAPSHOT_VALIDITY.UNREPRODUCIBLE, reasons: ['missing_snapshot'] };
  const reasons = [];
  if (snapshot.engineTraceVersion !== ENGINE_TRACE_VERSION) {
    return { state: SNAPSHOT_VALIDITY.UNREPRODUCIBLE, reasons: ['engine_version'] };
  }
  const savedScope = snapshot.field?.fieldScope ?? null;
  const liveScope = live.fieldScope ?? null;
  if (savedScope && liveScope && savedScope !== liveScope) reasons.push('field_scope');
  const savedDemo = snapshot.field?.canonicalDemoFieldId ?? snapshot.field?.demoFieldId ?? null;
  const liveDemo = live.demoFieldId ?? null;
  if (savedDemo === DEMO_FIELD_ID && liveDemo !== DEMO_FIELD_ID) reasons.push('demo_field_identity');
  if (savedDemo && savedDemo !== DEMO_FIELD_ID) reasons.push('untrusted_demo_identity');
  if (
    live.materialFingerprint &&
    snapshot.evaluationInputs?.fingerprint &&
    live.materialFingerprint !== snapshot.evaluationInputs.fingerprint
  ) {
    reasons.push('inputs_changed');
  }
  if (snapshot.climate?.evidenceDigest && live.climateDigest) {
    if (!climateDigestsEqual(snapshot.climate.evidenceDigest, live.climateDigest)) reasons.push('climate_evidence');
  }
  if (!snapshot.climate?.evidenceDigest?.reproducible && !live.climateDigest?.reproducible && !live.hasCurrentEvaluation) {
    reasons.push('climate_evidence_missing');
  }
  if (reasons.some((r) => r === 'field_scope' || r === 'demo_field_identity' || r === 'untrusted_demo_identity')) {
    return { state: SNAPSHOT_VALIDITY.STALE, reasons };
  }
  if (reasons.some((r) => r === 'inputs_changed' || r === 'climate_evidence')) {
    return { state: SNAPSHOT_VALIDITY.STALE, reasons };
  }
  if (live.hasCurrentEvaluation === true) {
    return { state: SNAPSHOT_VALIDITY.CURRENT, reasons: [] };
  }
  if (reasons.includes('climate_evidence_missing')) {
    return { state: SNAPSHOT_VALIDITY.UNREPRODUCIBLE, reasons };
  }
  return { state: SNAPSHOT_VALIDITY.HISTORICAL, reasons: ['awaiting_rerun'] };
}

export function assessImportedSnapshotTrust(snapshot, plan) {
  if (!snapshot) return null;
  if (snapshot.engineTraceVersion !== ENGINE_TRACE_VERSION) {
    return { state: SNAPSHOT_VALIDITY.UNREPRODUCIBLE, reasons: ['engine_version'] };
  }
  const scopeFromPlan = plan?.farmerInputs?.fieldScope ?? null;
  const scopeFromSnapshot = snapshot.field?.fieldScope ?? null;
  if (scopeFromPlan && scopeFromSnapshot && scopeFromPlan !== scopeFromSnapshot) {
    return { state: SNAPSHOT_VALIDITY.STALE, reasons: ['field_scope'] };
  }
  const demo = snapshot.field?.canonicalDemoFieldId ?? snapshot.field?.demoFieldId;
  if (scopeFromSnapshot?.startsWith('demo:') && !demo) {
    return { state: SNAPSHOT_VALIDITY.UNREPRODUCIBLE, reasons: ['missing_demo_identity'] };
  }
  if (demo && demo !== DEMO_FIELD_ID) {
    return { state: SNAPSHOT_VALIDITY.UNREPRODUCIBLE, reasons: ['untrusted_demo_identity'] };
  }
  return { state: SNAPSHOT_VALIDITY.HISTORICAL, reasons: ['imported'] };
}

export function markSnapshotArchived(snapshot, reason = 'invalidated') {
  if (!snapshot) return null;
  return {
    ...snapshot,
    validity: {
      ...(snapshot.validity ?? {}),
      state: SNAPSHOT_VALIDITY.STALE,
      reason,
      archivedAt: new Date().toISOString(),
    },
  };
}