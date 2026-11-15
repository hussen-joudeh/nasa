/** Visual V3A — presentation-only Decision Breakpoint threshold axis (engine data only). */
import { messages } from './i18n.mjs';
import { cubicMetresToMillimetres, millimetresToCubicMetres } from './water-truth.mjs';
import { formatDepthMm, formatVolumeM3, formatRangeDisplay } from './display-format.mjs';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function statusLabel(status, lang) {
  return messages[lang].decision[status] ?? status;
}

function pct(value, min, max) {
  if (!finite(value) || !finite(min) || !finite(max) || max <= min) return null;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function budgetInMm(budget, period, areaHa) {
  if (!budget || budget.period !== period) return null;
  const raw = budget.amount;
  if (raw === '' || raw === undefined || raw === null) return null;
  const amount = Number(raw);
  if (!finite(amount)) return null;
  if (budget.unit === 'mm') return amount;
  if (budget.unit === 'm3' && finite(areaHa) && areaHa > 0) return cubicMetresToMillimetres(amount, areaHa);
  return null;
}

function rangeToMm(range, areaHa) {
  if (!range || !finite(areaHa) || areaHa <= 0) return null;
  const min = range.unit === 'mm' ? Number(range.min) : cubicMetresToMillimetres(range.min, areaHa);
  const max = range.unit === 'mm' ? Number(range.max) : cubicMetresToMillimetres(range.max, areaHa);
  if (!finite(min) || !finite(max) || max < min) return null;
  return { min, max, period: range.period };
}

function evaluationSlice(evaluation, finding) {
  if (!evaluation || !finding) return null;
  const seasonRow = finding.season ? evaluation.water?.seasons?.find((row) => row.season === finding.season) : null;
  const ruleStatus = evaluation.checks?.find((check) => check.ruleId === finding.ruleId && check.season === finding.season)?.status ?? finding.baselineStatus ?? 'UNKNOWN';
  return {
    overall: evaluation.status ?? 'UNKNOWN',
    seasonSummary: seasonRow?.status ?? 'UNKNOWN',
    ruleStatus,
    needMm: seasonRow?.needMm ?? null,
    budgetRule: seasonRow?.budgetStatus ?? null,
  };
}

function statusChip(status, lang, title) {
  const label = statusLabel(status, lang);
  return `<span class="preflight-status breakpoint-status-chip" data-status="${esc(status)}"${title ? ` title="${esc(title)}"` : ''}><span class="breakpoint-status-glyph" aria-hidden="true"></span><span>${esc(label)}</span></span>`;
}

export function pickPrimaryBreakpointFinding(findings) {
  const list = Array.isArray(findings) ? findings : [];
  return (
    list.find((item) => item.classification === 'DECISION-SENSITIVE' && item.ruleId === 'water.balance' && item.threshold && item.testedRange) ??
    list.find((item) => item.classification === 'DECISION-SENSITIVE' && item.threshold && item.testedRange) ??
    null
  );
}

export function renderBreakpointThresholdAxis({ lang = 'en', finding, evaluation, waterBudget, areaHa, period, inputs, observedChanges } = {}) {
  const p = messages[lang].preflight.breakpoint;
  const viz = p.viz ?? {};
  if (!finding?.testedRange || !finding.threshold || !finite(areaHa) || areaHa <= 0) {
    return `<div class="breakpoint-axis breakpoint-axis--empty" role="region" aria-label="${esc(viz.axisTitle ?? p.title)}"><p class="breakpoint-axis-empty">${esc(viz.insufficientAxis ?? p.classifications['INSUFFICIENT EVIDENCE'])}</p></div>`;
  }

  const span = rangeToMm(finding.testedRange, areaHa);
  if (!span) {
    return `<div class="breakpoint-axis breakpoint-axis--empty" role="region" aria-label="${esc(viz.axisTitle ?? p.title)}"><p class="breakpoint-axis-empty">${esc(viz.insufficientAxis ?? p.classifications['INSUFFICIENT EVIDENCE'])}</p></div>`;
  }

  const thresholdMm = finding.threshold.mm;
  const currentMm = budgetInMm(waterBudget, finding.testedRange.period, areaHa);
  const slice = evaluationSlice(evaluation, finding);
  const need = slice?.needMm;
  const thresholdPct = pct(thresholdMm, span.min, span.max);
  const currentPct = currentMm === null ? null : pct(currentMm, span.min, span.max);
  const needMinPct = need && finite(need.min) ? pct(need.min, span.min, span.max) : null;
  const needMaxPct = need && finite(need.max) ? pct(need.max, span.min, span.max) : null;

  const zoneLow = finding.statuses?.atMin ?? 'UNKNOWN';
  const zoneHigh = finding.statuses?.atMax ?? 'UNKNOWN';
  const split = thresholdPct ?? 50;

  const ariaParts = [
    `${viz.testedRangeAxis ?? p.testedRange}: ${formatRangeDisplay(span.min, span.max, lang, 'mm', { depth: true })} mm`,
    `${p.threshold}: ${formatDepthMm(thresholdMm, lang)} mm`,
    currentMm === null ? viz.budgetUnset ?? p.availableWater : `${viz.yourBudget ?? p.availableWater}: ${formatDepthMm(currentMm, lang)} mm`,
    slice ? `${viz.seasonRule ?? p.currentRuleStatus}: ${statusLabel(slice.ruleStatus, lang)}` : '',
    slice ? `${viz.overallPlan ?? messages[lang].preflight.overallStatus}: ${statusLabel(slice.overall, lang)}` : '',
  ].filter(Boolean);

  const needBand =
    needMinPct !== null && needMaxPct !== null
      ? `<div class="breakpoint-need-band" style="--need-start:${Math.min(needMinPct, needMaxPct)}%;--need-end:${Math.max(needMinPct, needMaxPct)}%;"><span class="breakpoint-need-label">${esc(viz.modeledNeed ?? p.modeledPlanNeed)} · <bdi dir="ltr">${esc(formatRangeDisplay(need.min, need.max, lang, 'mm', { depth: true }))} mm · ${esc(formatRangeDisplay(millimetresToCubicMetres(need.min, areaHa), millimetresToCubicMetres(need.max, areaHa), lang, 'm³'))} m³</bdi></span></div>`
      : '';

  const thresholdMarker =
    thresholdPct !== null
      ? `<div class="breakpoint-marker breakpoint-marker--threshold" style="--pos:${thresholdPct}%" tabindex="0"><span class="breakpoint-marker-pin" aria-hidden="true"></span><span class="breakpoint-marker-label">${esc(viz.thresholdMarker ?? p.threshold)}<bdi dir="ltr">${esc(formatDepthMm(thresholdMm, lang))} mm · ${esc(formatVolumeM3(finding.threshold.m3, lang))} m³</bdi></span>${statusChip(finding.statuses?.atThreshold ?? slice?.ruleStatus ?? 'UNKNOWN', lang)}</div>`
      : '';

  const currentMarker =
    currentPct !== null
      ? `<div class="breakpoint-marker breakpoint-marker--budget" style="--pos:${currentPct}%" tabindex="0"><span class="breakpoint-marker-pin" aria-hidden="true"></span><span class="breakpoint-marker-label">${esc(viz.yourBudget ?? p.availableWater)}<bdi dir="ltr">${esc(formatDepthMm(currentMm, lang))} mm · ${esc(formatVolumeM3(millimetresToCubicMetres(currentMm, areaHa), lang))} m³</bdi></span>${statusChip(slice?.ruleStatus ?? 'UNKNOWN', lang, viz.ruleOnlyNotPlan ?? p.planCaution)}</div>`
      : `<p class="breakpoint-budget-unset" role="status">${esc(viz.budgetUnset ?? p.availableWater)}</p>`;

  const periodLabel = period?.startIso && period?.endIso ? `<bdi>${esc(period.startIso)} — ${esc(period.endIso)}</bdi>` : esc(messages[lang].preflight.noClimatePeriod);

  const assumptions = [];
  if (inputs?.illustrativeCropSettings) assumptions.push(messages[lang].preflight.illustrativeSettings);
  if (inputs?.effectiveRainfallSlopeConfirmed) assumptions.push(messages[lang].preflight.slopeConfirmation);

  const budgetChange = observedChanges?.changed?.find((item) => item.ruleId === finding.ruleId && item.season === finding.season);
  const traceLine = budgetChange
    ? `<p class="breakpoint-trace-compare"><strong>${esc(viz.priorRun ?? 'Prior run')}:</strong> ${statusChip(budgetChange.before, lang)} → ${statusChip(budgetChange.after, lang)}</p>`
    : '';

  return `<section class="breakpoint-axis" role="img" aria-label="${esc(ariaParts.join(' · '))}"><header class="breakpoint-axis-head"><div><h5 class="breakpoint-axis-title">${esc(viz.axisTitle ?? p.title)}</h5><p class="muted breakpoint-axis-sub">${esc(viz.axisIntro ?? p.sensitiveDetail)}</p></div></header><div class="breakpoint-axis-track" style="--split:${split}%"><div class="breakpoint-zone breakpoint-zone--low" data-status="${esc(zoneLow)}"><span class="breakpoint-zone-label">${statusChip(zoneLow, lang)}<span class="breakpoint-zone-caption">${esc(viz.belowThreshold ?? p.lowBudget)}</span></span></div><div class="breakpoint-zone breakpoint-zone--high" data-status="${esc(zoneHigh)}"><span class="breakpoint-zone-label">${statusChip(zoneHigh, lang)}<span class="breakpoint-zone-caption">${esc(viz.aboveThreshold ?? p.highBudget)}</span></span></div>${needBand}${thresholdMarker}${currentMarker}</div><div class="breakpoint-axis-scale" aria-hidden="true"><span><bdi dir="ltr">${esc(formatDepthMm(span.min, lang))}</bdi></span><span><bdi dir="ltr">${esc(formatDepthMm(span.max, lang))}</bdi></span></div><div class="breakpoint-status-ladder" role="group" aria-label="${esc(viz.statusLadder ?? 'Status hierarchy')}"><div class="breakpoint-ladder-row"><span>${esc(viz.seasonRule ?? p.currentRuleStatus)}</span>${statusChip(slice?.ruleStatus ?? 'UNKNOWN', lang, viz.ruleOnlyNotPlan ?? p.planCaution)}</div><div class="breakpoint-ladder-row"><span>${esc(viz.seasonSummary ?? messages[lang].preflight.seasonSummary)}</span>${statusChip(slice?.seasonSummary ?? 'UNKNOWN', lang)}</div><div class="breakpoint-ladder-row breakpoint-ladder-row--overall"><span>${esc(viz.overallPlan ?? messages[lang].preflight.overallStatus)}</span>${statusChip(slice?.overall ?? 'UNKNOWN', lang, messages[lang].preflight.overallPreflightHint)}</div></div><div class="breakpoint-provenance"><p><strong>${esc(viz.dataSource ?? messages[lang].preflight.sources)}:</strong> NASA POWER · ${periodLabel}</p>${assumptions.length ? `<p><strong>${esc(viz.assumptionsOn ?? messages[lang].preflight.assumptions)}:</strong> ${assumptions.map((item) => esc(item)).join(' · ')}</p>` : ''}<p class="breakpoint-provenance-caution">${esc(viz.ruleOnlyNotPlan ?? p.planCaution)}</p>${traceLine}</div></section>`;
}