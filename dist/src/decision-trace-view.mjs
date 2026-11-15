import { messages } from './i18n.mjs';
import { farmerChangeRecords } from './decision-trace.mjs';

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function statusLabel(status, lang) {
  return messages[lang].decision[status] ?? status;
}

function provenanceText(prov, lang) {
  const t = messages[lang].trace;
  if (!prov) return esc(t.notRecorded);
  const kind = prov.kind ? esc(t.provenanceKind?.[prov.kind] ?? prov.kind) : '';
  const note = prov.noteKey && t.provenanceNotes?.[prov.noteKey] ? esc(t.provenanceNotes[prov.noteKey]) : prov.note ? esc(prov.note) : '';
  return note ? `${kind} — ${note}` : kind || esc(t.notRecorded);
}

export function renderWhyCheck(check, lang) {
  const t = messages[lang].trace;
  const p = messages[lang].preflight;
  const label = p.checkLabels[check.ruleId] ?? check.ruleId;
  const season = check.season ? ` · ${p.season} ${check.season}` : '';
  const missing = check.missingInformation?.length
    ? `<p><strong>${esc(t.missing)}</strong> ${check.missingInformation.map((k) => esc(p.missingLabels[k] ?? k)).join(' · ')}</p>`
    : '';
  const limitation = check.limitation ? `<p class="trace-limitation"><strong>${esc(t.limitation)}</strong> ${esc(check.limitation)}</p>` : '';
  return `<details class="trace-check" data-rule="${esc(check.ruleId)}"><summary><span data-status="${esc(check.status)}">${esc(statusLabel(check.status, lang))}</span> · ${esc(label)}${esc(season)}</summary><p>${esc(check.explanation)}</p><p><strong>${esc(t.inputProvenance)}</strong> ${provenanceText(check.inputProvenance, lang)}</p>${limitation}${missing}<p><strong>${esc(t.nextVerify)}</strong> ${esc(check.nextStep ?? t.notRecorded)}</p></details>`;
}

export function renderDecisionTraceWhy(trace, lang) {
  const t = messages[lang].trace;
  if (!trace) return '';
  const checks = trace.checks ?? [];
  const climateKind = trace.climate?.provenance?.kind;
  const climateLabel = climateKind ? esc(t.provenanceKind?.[climateKind] ?? climateKind) : esc(t.notRecorded);
  return `<section class="decision-trace-why" aria-labelledby="trace-title-${trace.rotationIndex}"><header><h4 id="trace-title-${trace.rotationIndex}">${esc(t.whyTitle)}</h4><p class="muted">${esc(t.whyIntro)}</p></header><p>${esc(t.overall)}: <strong data-status="${esc(trace.overallStatus)}">${esc(statusLabel(trace.overallStatus, lang))}</strong></p><p>${esc(t.climate)}: ${climateLabel}${trace.climate?.period?.startIso ? ` · <bdi>${esc(trace.climate.period.startIso)} — ${esc(trace.climate.period.endIso)}</bdi>` : ''}</p><div class="trace-checks">${checks.map((c) => renderWhyCheck(c, lang)).join('')}</div></section>`;
}

export function renderFarmerChangeTrace(impact, lang) {
  const t = messages[lang].trace;
  const f = messages[lang].farmer;
  const rows = farmerChangeRecords(impact);
  if (!rows.length) return `<p class="trace-farmer muted">${esc(t.noFarmerChanges)}</p>`;
  const inputLabels = {
    'farmerInputs.previousCrop.confirmed': f.changeInputPreviousCrop,
    'preflightInputs.waterBudget': f.changeInputBudget,
    unknown: f.changeInputUnknown,
  };
  const items = rows
    .map(
      (row) =>
        `<li><strong>${esc(messages[lang].preflight.checkLabels[row.ruleId] ?? row.ruleId)}</strong>: ${esc(statusLabel(row.from, lang))} → ${esc(statusLabel(row.to, lang))}. ${esc(t.input)}: ${esc(inputLabels[row.inputChanged] ?? f.changeInputUnknown)} (${esc(t.assertionNotVerified)})</li>`,
    )
    .join('');
  const unresolved =
    rows[0]?.unresolved?.length > 0
      ? `<p>${esc(t.stillUnknown)} ${rows[0].unresolved.map((id) => esc(messages[lang].preflight.checkLabels[id] ?? id)).join(' · ')}</p>`
      : '';
  return `<section class="trace-farmer-changes" aria-live="polite"><h4>${esc(t.farmerChangesTitle)}</h4><ul>${items}</ul><p class="trace-caution">${esc(t.notPlanApproval)}</p>${unresolved}</section>`;
}