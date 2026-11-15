/** Visual V3B — presentational Preflight hierarchy (engine output only). */
import { messages } from './i18n.mjs';
import { WATER_SOURCES } from './water-truth.mjs';

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value, lang, digits = 0) => new Intl.NumberFormat(lang === 'ar' ? 'ar' : 'en', { maximumFractionDigits: digits }).format(value);

export function checkKey(check) {
  return `${check.ruleId}:${check.season ?? 'plan'}`;
}

export function statusLabel(status, lang) {
  return messages[lang].decision[status] ?? status;
}

export function nonBioChecks(evaluation) {
  return (evaluation?.checks ?? []).filter((check) => !check.ruleId.startsWith('biofirewall.'));
}

export function groupChecks(checks) {
  const attention = [];
  const unknown = [];
  const pass = [];
  for (const check of checks) {
    if (check.status === 'FAIL' || check.status === 'WARNING') attention.push(check);
    else if (check.status === 'UNKNOWN') unknown.push(check);
    else if (check.status === 'PASS') pass.push(check);
  }
  const rank = { FAIL: 0, WARNING: 1, UNKNOWN: 2, PASS: 3 };
  attention.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.season ?? 0) - (b.season ?? 0));
  unknown.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.ruleId.localeCompare(b.ruleId));
  pass.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.ruleId.localeCompare(b.ruleId));
  return { attention, unknown, pass };
}

function statusChip(status, lang, title) {
  return `<span class="preflight-status" data-status="${esc(status)}"${title ? ` title="${esc(title)}"` : ''}>${esc(statusLabel(status, lang))}</span>`;
}

function countChips(counts, lang) {
  const d = messages[lang].decision;
  return ['PASS', 'WARNING', 'FAIL', 'UNKNOWN']
    .map((status) => `<span class="preflight-count-chip" data-status="${esc(status)}"><span class="preflight-count-label">${esc(d[status])}</span><bdi>${fmt(counts?.[status] ?? 0, lang, 0)}</bdi></span>`)
    .join('');
}

export function renderStalePreflightResults(lang = 'en') {
  const p = messages[lang].preflight;
  return `<div class="preflight-stale" role="status" data-stale="1"><p class="preflight-stale-title">${esc(p.staleTitle)}</p><p class="preflight-stale-body">${esc(p.staleBody)}</p><button type="button" class="primary preflight-stale-run" id="preflight-stale-run">${esc(p.staleAction)}</button></div>`;
}

export function renderRotationStrip(evaluations, lang, selected = 0) {
  const p = messages[lang].preflight;
  const tabs = evaluations
    .map((evaluation, index) => {
      const label = index === 0 ? messages[lang].rotationA : index === 1 ? messages[lang].rotationB : `${messages[lang].rotationLabelPrefix} ${lang === 'ar' && index === 2 ? 'ج' : String.fromCharCode(65 + index)}`;
      const pressed = index === selected;
      return `<button type="button" class="preflight-rotation-tab" role="tab" id="preflight-tab-${index}" aria-controls="preflight-panel-${index}" aria-selected="${String(pressed)}" data-preflight-rotation="${index}" tabindex="${pressed ? '0' : '-1'}"><span class="preflight-rotation-tab-label">${esc(label)}</span>${statusChip(evaluation.status, lang, p.overallPreflightHint)}<span class="preflight-rotation-tab-counts">${countChips(evaluation.statuses, lang)}</span></button>`;
    })
    .join('');
  return `<div class="preflight-rotation-strip" role="tablist" aria-label="${esc(p.rotationCompare)}">${tabs}</div>`;
}

export function renderOverview(evaluation, rotationIndex, lang, selected) {
  const p = messages[lang].preflight;
  const checks = nonBioChecks(evaluation);
  const { attention, unknown } = groupChecks(checks);
  const priorities = [...attention, ...unknown].slice(0, 5);
  const priorityList = priorities.length
    ? `<ol class="preflight-priority-list">${priorities
        .map((check) => {
          const label = p.checkLabels[check.ruleId] ?? check.ruleId;
          const season = check.season ? ` · ${p.season} ${fmt(check.season, lang, 0)}` : '';
          return `<li><button type="button" class="preflight-check-pick" data-rotation="${rotationIndex}" data-check-key="${esc(checkKey(check))}">${statusChip(check.status, lang)}<span>${esc(label)}${esc(season)}</span></button></li>`;
        })
        .join('')}</ol>`
    : `<p class="muted">${esc(p.noPriorityChecks)}</p>`;
  const hidden = rotationIndex !== selected ? ' hidden' : '';
  return `<section class="preflight-overview preflight-rotation-panel" id="preflight-panel-${rotationIndex}" role="tabpanel" aria-labelledby="preflight-tab-${rotationIndex}" data-rotation="${rotationIndex}"${hidden}><div class="preflight-overview-head"><div><p class="eyebrow">${esc(p.resultsOverview)}</p><h4>${statusChip(evaluation.status, lang, p.overallPreflightHint)}</h4><p class="preflight-overall-hint">${esc(p.overallPreflightHint)}</p></div><div class="preflight-overview-counts" aria-label="${esc(p.statusCounts)}">${countChips(evaluation.statuses, lang)}</div></div><div class="preflight-overview-priority"><h5>${esc(p.priorityChecks)}</h5>${priorityList}<p><a class="preflight-jump-checks" href="#preflight-check-groups-${rotationIndex}">${esc(p.viewAllChecks)}</a></p></div></section>`;
}

export function renderCheckDetailBody(check, lang, helpers) {
  const p = messages[lang].preflight;
  const label = p.checkLabels[check.ruleId] ?? check.ruleId;
  const season = check.season ? ` · ${p.season} ${fmt(check.season, lang, 0)}` : '';
  const missing = check.missingInformation?.length ? `<p><strong>${esc(p.missing)}:</strong> ${check.missingInformation.map((key) => esc(p.missingLabels[key] ?? key)).join(' · ')}</p>` : '';
  return `<header class="preflight-drawer-check-head">${statusChip(check.status, lang)}<h5>${esc(label)}${esc(season)}</h5></header><p>${esc(helpers.localizedExplanation(check, lang))}</p><p><strong>${esc(p.inputEvidence)}:</strong></p><pre>${helpers.jsonEvidence(check.inputs)}</pre>${missing}<p><strong>${esc(p.nextStep)}:</strong> ${esc(helpers.localizedNextStep(check, lang))}</p><p><strong>${esc(p.sources)}:</strong> ${helpers.sourceLinks(check, lang)}</p>`;
}

function renderCheckRow(check, rotationIndex, lang) {
  const p = messages[lang].preflight;
  const label = p.checkLabels[check.ruleId] ?? check.ruleId;
  const season = check.season ? ` · ${p.season} ${fmt(check.season, lang, 0)}` : '';
  return `<li><button type="button" class="preflight-check-pick" data-rotation="${rotationIndex}" data-check-key="${esc(checkKey(check))}">${statusChip(check.status, lang)}<span class="preflight-check-pick-label">${esc(label)}${esc(season)}</span></button></li>`;
}

export function renderCheckGroups(evaluation, rotationIndex, lang, selected) {
  const p = messages[lang].preflight;
  const groups = groupChecks(nonBioChecks(evaluation));
  const block = (name, title, items, open) =>
  items.length
    ? `<details class="preflight-check-group" data-group="${esc(name)}"${open ? ' open' : ''}><summary>${esc(title)} (<bdi>${fmt(items.length, lang, 0)}</bdi>)</summary><ul class="preflight-check-group-list">${items.map((c) => renderCheckRow(c, rotationIndex, lang)).join('')}</ul></details>`
    : '';
  const hidden = rotationIndex !== selected ? ' hidden' : '';
  const allChecks = nonBioChecks(evaluation);
  const allBlock = allChecks.length
    ? `<details class="preflight-check-group" data-group="all"><summary>${esc(p.groupAll)} (<bdi>${fmt(allChecks.length, lang, 0)}</bdi>)</summary><p class="muted">${esc(p.groupAllHint)}</p><ul class="preflight-check-group-list">${allChecks.map((c) => renderCheckRow(c, rotationIndex, lang)).join('')}</ul></details>`
    : '';
  return `<div id="preflight-check-groups-${rotationIndex}" class="preflight-check-groups" data-rotation="${rotationIndex}"${hidden}>${block('attention', p.groupAttention, groups.attention, true)}${block('unknown', p.groupUnknown, groups.unknown, groups.attention.length === 0)}${block('pass', p.groupPass, groups.pass, false)}${allBlock}</div>`;
}

export function renderCheckStore(evaluations, lang, helpers) {
  return evaluations
    .map((evaluation, rotationIndex) =>
      nonBioChecks(evaluation)
        .map((check) => {
          const id = `preflight-detail-${rotationIndex}-${checkKey(check).replace(/[^\w.-]/g, '_')}`;
          return `<div id="${esc(id)}" class="preflight-check-store" data-rotation="${rotationIndex}" data-check-key="${esc(checkKey(check))}" hidden>${renderCheckDetailBody(check, lang, helpers)}</div>`;
        })
        .join(''),
    )
    .join('');
}

export function renderProvenanceDrawer(lang) {
  const p = messages[lang].preflight;
  return `<aside id="preflight-provenance-drawer" class="preflight-provenance-drawer" hidden aria-labelledby="preflight-drawer-title"><header class="preflight-drawer-head"><h4 id="preflight-drawer-title">${esc(p.drawerTitle)}</h4><button type="button" class="preflight-drawer-close" id="preflight-drawer-close" aria-label="${esc(p.drawerClose)}">×</button></header><div id="preflight-drawer-body" class="preflight-drawer-body"></div></aside>`;
}

export function renderMethodFooter(lang) {
  const p = messages[lang].preflight;
  return `<footer class="preflight-method-footer"><p class="preflight-method">${esc(p.method)} ${esc(p.methodDescription)}</p><p class="preflight-sources"><strong>${esc(p.sources)}:</strong> <a href="${esc(WATER_SOURCES.fao56)}" target="_blank" rel="noreferrer">FAO-56</a> · <a href="${esc(WATER_SOURCES.faoEffectiveRainfall)}" target="_blank" rel="noreferrer">FAO irrigation manual</a> · <a href="${esc(WATER_SOURCES.nasaPowerDaily)}" target="_blank" rel="noreferrer">NASA POWER daily</a></p></footer>`;
}