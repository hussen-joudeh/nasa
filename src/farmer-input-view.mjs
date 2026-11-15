import { messages } from './i18n.mjs';
import { crops } from './domain.mjs';

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderMappedCropHistory(rows, lang) {
  const m = messages[lang].farmer;
  if (!Array.isArray(rows) || !rows.length) return '';
  const list = rows
    .map(
      (r) =>
        `<li><span class="mapped-year">${esc(r.year)}</span> · ${esc(r.crop_label ?? messages[lang].unavailable)} <em>(${esc(m.mappedOnly)})</em></li>`,
    )
    .join('');
  return `<details class="mapped-crop-history"><summary>${esc(m.mappedHistoryTitle)}</summary><p class="small muted">${esc(m.mappedHistoryNote)}</p><ol>${list}</ol></details>`;
}

export function renderFarmerPreviousCropControls({ lang, farmerInputs, mappedHistory = [] }) {
  const m = messages[lang].farmer;
  const pc = farmerInputs?.previousCrop ?? {};
  const options =
    '<option value="">' +
    esc(m.unconfirmedOption) +
    '</option>' +
    Object.keys(crops)
      .map((id) => `<option value="${id}"${id === pc.cropId ? ' selected' : ''}>${esc(crops[id][lang])}</option>`)
      .join('');
  const confirmed = pc.confirmed === true;
  return `<div class="farmer-previous-crop"><label for="previous-crop">${esc(m.previousCropSelect)}</label><select id="previous-crop">${options}</select><label class="preflight-check-label farmer-confirm"><input type="checkbox" id="previous-crop-confirmed"${confirmed ? ' checked' : ''}><span>${esc(m.confirmPreviousCrop)}</span></label><p class="small farmer-provenance" role="status">${esc(confirmed ? m.confirmedStatus : m.unconfirmedStatus)}</p>${renderMappedCropHistory(mappedHistory, lang)}</div>`;
}

export function renderFarmerInputImpact({ lang, impact }) {
  const m = messages[lang].farmer;
  if (!impact?.items?.length) {
    return `<div class="farmer-impact" aria-live="polite"><p class="small muted">${esc(m.noImpactYet)}</p></div>`;
  }
  const decision = messages[lang].decision;
  const status = (s) => decision[s] ?? s;
  const rows = impact.items
    .map(
      (item) =>
        `<li data-rule="${esc(item.ruleId)}"><strong>${esc(m.impactRule(item.ruleId))}</strong>: ${esc(status(item.from))} → ${esc(status(item.to))}. <span class="muted">${esc(item.noteKey ? m.impactNotes?.[item.noteKey] ?? '' : item.note ?? '')}</span></li>`,
    )
    .join('');
  const caution = impact.overallStatus?.from !== impact.overallStatus?.to
    ? `<p class="farmer-impact-caution">${esc(m.overallChanged)} <bdi>${esc(status(impact.overallStatus.from))} → ${esc(status(impact.overallStatus.to))}</bdi>. ${esc(m.notPlanApproval)}</p>`
    : `<p class="farmer-impact-caution">${esc(m.notPlanApproval)}</p>`;
  return `<div class="farmer-impact" aria-live="polite"><h4>${esc(m.impactTitle)}</h4><ul>${rows}</ul>${caution}</div>`;
}