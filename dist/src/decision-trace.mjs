import { waterBudgetProvenance } from './farmer-inputs.mjs';

export const ENGINE_TRACE_VERSION = 'fieldshift-07g';

const ENGINE_BY_PREFIX = [
  { prefix: 'rotation.', engine: 'evaluateRotation', module: 'domain.mjs' },
  { prefix: 'water.', engine: 'estimateWaterTruth', module: 'water-truth.mjs' },
  { prefix: 'biofirewall.', engine: 'evaluateBioFirewall', module: 'biofirewall.mjs' },
];

function resolveEngine(ruleId) {
  const hit = ENGINE_BY_PREFIX.find((row) => ruleId.startsWith(row.prefix));
  return hit ?? { engine: 'runPreflight', module: 'preflight.mjs' };
}

function climateProvenance(climateData) {
  if (!climateData) return { kind: 'not_loaded', directCalculationInput: false };
  if (climateData.storage === 'MongoDB') {
    return {
      kind: 'stored_daily',
      directCalculationInput: true,
      source: '/api/demo-field',
      period: climateData.period ?? null,
      timeStandard: climateData.timeStandard ?? 'LST',
    };
  }
  if (climateData.source === 'NASA POWER') {
    return {
      kind: 'live_nasa_power',
      directCalculationInput: true,
      source: climateData.url ?? 'NASA POWER daily',
      period: climateData.period ?? null,
      dataset: climateData.dataset ?? null,
    };
  }
  return { kind: 'unsupported', directCalculationInput: false };
}

function inputProvenance(ruleId, context, farmerInputs, climateData) {
  if (ruleId === 'rotation.history') {
    const pc = farmerInputs?.previousCrop;
    if (pc?.confirmed === true && pc.cropId) {
      return {
        kind: 'farmer_assertion',
        directCalculationInput: true,
        field: 'previousCrop',
        value: pc.cropId,
        noteKey: 'previousCrop',
      };
    }
    return { kind: 'missing', directCalculationInput: false, noteKey: 'previousCropMissing' };
  }
  if (ruleId === 'water.budget' || ruleId === 'water.balance' || ruleId === 'water.plan-balance') {
    const budget = waterBudgetProvenance(context?.waterBudget);
    return {
      kind: budget.provided ? 'farmer_assertion' : 'missing',
      ...budget,
      directCalculationInput: budget.provided === true,
      field: 'waterBudget',
      noteKey: budget.provided ? 'waterBudget' : 'waterBudgetMissing',
    };
  }
  if (ruleId === 'water.field-area') {
    const ok = Number.isFinite(context?.areaHa) && context.areaHa > 0;
    return {
      kind: ok ? 'geometry' : 'missing',
      directCalculationInput: ok,
      field: 'polygon',
      noteKey: ok ? 'fieldArea' : 'fieldAreaMissing',
    };
  }
  if (ruleId === 'water.crop-settings') {
    const on = context?.illustrativeCropSettings === true;
    return {
      kind: on ? 'model_assumption' : 'missing',
      directCalculationInput: on,
      field: 'illustrativeCropSettings',
      noteKey: on ? 'cropSettings' : 'cropSettingsMissing',
    };
  }
  if (ruleId === 'water.effective-rainfall-scope') {
    const on = context?.effectiveRainfallSlopeConfirmed === true;
    return {
      kind: on ? 'farmer_assertion' : 'missing',
      directCalculationInput: on,
      field: 'effectiveRainfallSlopeConfirmed',
      noteKey: on ? 'slopeScope' : 'slopeScopeMissing',
    };
  }
  if (ruleId === 'water.season-data' || ruleId === 'water.season-coverage') {
    const dates = Array.isArray(context?.plantingDates) ? context.plantingDates : [];
    const ok = dates.some((d) => typeof d === 'string' && d.trim() !== '');
    return {
      kind: ok ? 'calendar_input' : 'missing',
      directCalculationInput: ok,
      field: 'plantingDates',
      noteKey: ok ? 'plantingCalendar' : 'plantingCalendarMissing',
    };
  }
  const climateWaterRules = new Set([
    'water.climate-support',
    'water.daily-completeness',
    'water.reference-eto',
    'water.crop-etc',
    'water.effective-precipitation',
  ]);
  if (ruleId === 'rotation.climate' || climateWaterRules.has(ruleId)) {
    const climate = climateProvenance(climateData);
    return { ...climate, field: 'climateDaily', noteKey: climate.kind === 'not_loaded' ? 'climateMissing' : 'climateDaily' };
  }
  if (ruleId.startsWith('water.')) {
    return { kind: 'derived', directCalculationInput: false, field: null, noteKey: 'derivedWater' };
  }
  if (ruleId === 'rotation.compatibility') {
    return { kind: 'missing', directCalculationInput: false, note: 'No local compatibility rules encoded; always UNKNOWN.' };
  }
  if (ruleId.startsWith('rotation.')) {
    return { kind: 'rotation_definition', directCalculationInput: true, field: 'rotation.sequence', note: 'Three catalog crops from user plan.' };
  }
  if (ruleId.startsWith('biofirewall.')) {
    return { kind: 'farmer_memory', directCalculationInput: true, field: 'biofirewall', note: 'Farmer-entered hazard and equipment records.' };
  }
  return { kind: 'context', directCalculationInput: false, note: 'Context-only or structural rule.' };
}

const LIMITATIONS = {
  'rotation.compatibility': 'Local pest, disease, and soil constraints are not encoded.',
  'rotation.climate': 'Annual grid summaries do not establish crop-season suitability.',
  'water.crop-settings': 'Illustrative FAO-56 templates are not locally validated.',
  'water.reference-eto': 'Hargreaves-Samani substitute; not Penman-Monteith.',
};

export function traceSingleCheck(check, meta) {
  const engine = resolveEngine(check.ruleId);
  return {
    ruleId: check.ruleId,
    status: check.status,
    explanation: check.explanation,
    season: check.season ?? null,
    inputs: structuredClone(check.inputs ?? {}),
    missingInformation: [...(check.missingInformation ?? [])],
    evidence: structuredClone(check.evidence ?? {}),
    nextStep: check.nextStep ?? null,
    engine: engine.engine,
    engineModule: engine.module,
    inputProvenance: inputProvenance(check.ruleId, meta.context, meta.farmerInputs, meta.climateData),
    limitation: LIMITATIONS[check.ruleId] ?? null,
  };
}

/** Deterministic trace from an existing runPreflight evaluation — no re-evaluation. */
export function buildDecisionTrace(evaluation, meta = {}) {
  const context = meta.context ?? {};
  const traceMeta = { ...meta, context };
  return {
    version: ENGINE_TRACE_VERSION,
    rotationIndex: meta.rotationIndex ?? 0,
    sequence: [...(evaluation.rotation?.sequence ?? [])],
    overallStatus: evaluation.status,
    checks: (evaluation.checks ?? []).map((check) => traceSingleCheck(check, traceMeta)),
    unknownRuleIds: (evaluation.checks ?? []).filter((c) => c.status === 'UNKNOWN').map((c) => c.ruleId),
    climate: {
      source: evaluation.climate?.source ?? meta.climateData?.source ?? null,
      period: evaluation.climate?.period ?? meta.climateData?.period ?? null,
      storage: meta.climateData?.storage ?? null,
      provenance: climateProvenance(meta.climateData),
    },
    field: {
      areaHa: evaluation.field?.areaHa ?? context.areaHa ?? null,
      fieldScope: meta.fieldScope ?? null,
      demoFieldId: meta.demoFieldId ?? null,
    },
  };
}

export function buildAllDecisionTraces(evaluations, meta) {
  return (evaluations ?? []).map((evaluation, rotationIndex) => buildDecisionTrace(evaluation, { ...meta, rotationIndex }));
}

export function traceFingerprint(traces) {
  const payload = (traces ?? []).map((trace) => ({
    sequence: trace.sequence,
    overallStatus: trace.overallStatus,
    checks: trace.checks.map((c) => ({ ruleId: c.ruleId, status: c.status, season: c.season })),
  }));
  return JSON.stringify(payload);
}

export function farmerChangeRecords(impact) {
  if (!impact?.items?.length) return [];
  return impact.items.map((item) => ({
    ruleId: item.ruleId,
    from: item.from,
    to: item.to,
    inputChanged:
      item.ruleId === 'rotation.history'
        ? 'farmerInputs.previousCrop.confirmed'
        : item.ruleId.startsWith('water.')
          ? 'preflightInputs.waterBudget'
          : 'unknown',
    provenance: 'farmer_assertion',
    engineRule: item.ruleId,
    note: item.note ?? null,
    unresolved: impact.unchangedUnknown ?? [],
  }));
}