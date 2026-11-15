import { ENGINE_TRACE_VERSION, traceFingerprint, buildAllDecisionTraces } from './decision-trace.mjs';
import { normalizeFarmerInputs, validateSavedFarmerInputs } from './farmer-inputs.mjs';
import { runPreflight } from './preflight.mjs';
import {
  SNAPSHOT_VALIDITY,
  climateEvidenceDigest,
  materialEvaluationFingerprint,
  assessSnapshotValidity,
} from './decision-snapshot-validity.mjs';
import { DEMO_FIELD_ID } from './demo-evidence.mjs';

export {
  SNAPSHOT_VALIDITY,
  assessSnapshotValidity,
  assessImportedSnapshotTrust,
  climateEvidenceDigest,
  materialEvaluationFingerprint,
} from './decision-snapshot-validity.mjs';

export function buildDecisionSnapshot({
  rotations = [],
  traces = [],
  farmerInputs,
  preflightInputs,
  farmerImpact = null,
  fieldScope = null,
  demoFieldId = null,
  polygon = null,
  areaHa = null,
  climateData = null,
  capturedAt = new Date().toISOString(),
}) {
  const canonicalDemoFieldId = demoFieldId === DEMO_FIELD_ID ? demoFieldId : null;
  const evidenceDigest = climateEvidenceDigest(climateData);
  const inputFingerprint = materialEvaluationFingerprint({
    rotations,
    preflightInputs,
    farmerInputs,
    fieldScope,
    demoFieldId: canonicalDemoFieldId,
    areaHa,
  });
  const unknownConditions = [...new Set((traces ?? []).flatMap((t) => t.unknownRuleIds ?? []))];
  return {
    version: 1,
    engineTraceVersion: ENGINE_TRACE_VERSION,
    capturedAt,
    validity: { state: SNAPSHOT_VALIDITY.CURRENT, at: capturedAt },
    field: {
      fieldScope,
      demoFieldId: canonicalDemoFieldId,
      canonicalDemoFieldId,
      areaHa: areaHa ?? null,
      vertexCount: Array.isArray(polygon) ? polygon.length : null,
      geometryReference: fieldScope ?? null,
    },
    climate: {
      source: climateData?.source ?? null,
      storage: climateData?.storage ?? null,
      period: climateData?.period ?? null,
      url: climateData?.url ?? null,
      timeStandard: climateData?.timeStandard ?? null,
      evidenceDigest,
    },
    evaluationInputs: { fingerprint: inputFingerprint },
    rotations: rotations.map((sequence) => [...sequence]),
    farmerInputs: normalizeFarmerInputs(farmerInputs, fieldScope),
    preflightInputs: preflightInputs
      ? {
          waterBudget: preflightInputs.waterBudget
            ? { ...preflightInputs.waterBudget, provenance: 'farmer_assertion_when_non_empty' }
            : null,
          plantingDates: Array.isArray(preflightInputs.plantingDates) ? [...preflightInputs.plantingDates] : null,
          illustrativeCropSettings: preflightInputs.illustrativeCropSettings === true,
          effectiveRainfallSlopeConfirmed: preflightInputs.effectiveRainfallSlopeConfirmed === true,
        }
      : null,
    farmerImpact: farmerImpact
      ? {
          items: (farmerImpact.items ?? []).map((item) => ({ ...item })),
          overallStatus: farmerImpact.overallStatus ? { ...farmerImpact.overallStatus } : null,
        }
      : null,
    traces: structuredClone(traces ?? []),
    keyResults: (traces ?? []).map((trace) => ({
      rotationIndex: trace.rotationIndex,
      overallStatus: trace.overallStatus,
      checks: trace.checks.map((c) => ({ ruleId: c.ruleId, status: c.status, season: c.season })),
    })),
    unknownConditions,
    reproducibility: { fingerprint: traceFingerprint(traces) },
  };
}

export function validateDecisionSnapshotStructure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('snapshot');
  if (value.version !== 1) throw Error('snapshot');
  if (typeof value.engineTraceVersion !== 'string') throw Error('snapshot');
  if (!Array.isArray(value.rotations) || !Array.isArray(value.traces)) throw Error('snapshot');
  if (value.farmerInputs) validateSavedFarmerInputs(value.farmerInputs);
}

/** Strict import used by engines that must match the current trace contract. */
export function validateDecisionSnapshot(value) {
  validateDecisionSnapshotStructure(value);
  if (value.engineTraceVersion !== ENGINE_TRACE_VERSION) throw Error('snapshot-engine');
}

/** Re-run engines with stored inputs; compare fingerprint only (status contract). */
export function reproduceFromSnapshot(snapshot, context, climateData = null) {
  validateDecisionSnapshotStructure(snapshot);
  if (snapshot.engineTraceVersion !== ENGINE_TRACE_VERSION) {
    return { matches: false, engineMismatch: true, fingerprint: null, evaluations: null, traces: null };
  }
  if (!snapshot?.rotations?.length) throw Error('snapshot-empty');
  const climate = climateData ?? context.climateData ?? null;
  const evaluations = snapshot.rotations.map((rotation) => runPreflight(rotation, context, climate));
  const traces = buildAllDecisionTraces(evaluations, {
    context,
    farmerInputs: snapshot.farmerInputs,
    climateData: climate,
    fieldScope: snapshot.field?.fieldScope ?? null,
    demoFieldId: snapshot.field?.canonicalDemoFieldId ?? snapshot.field?.demoFieldId ?? null,
  });
  const fingerprint = traceFingerprint(traces);
  const digestMatch = climateEvidenceDigest(climate);
  const savedDigest = snapshot.climate?.evidenceDigest ?? null;
  const climateMatches = !savedDigest || JSON.stringify(savedDigest) === JSON.stringify(digestMatch);
  return {
    fingerprint,
    matches: fingerprint === snapshot.reproducibility?.fingerprint && climateMatches,
    climateMatches,
    evaluations,
    traces,
  };
}

export function compareSnapshotToLive(snapshot, live) {
  return assessSnapshotValidity(snapshot, live);
}