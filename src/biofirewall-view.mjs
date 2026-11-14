import {messages} from './i18n.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const select=(id,label,items,value)=>`<label>${esc(label)}<select id="${id}">${items.map(([key,text])=>`<option value="${esc(key)}" ${value===key?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
const input=(id,label,value='',type='text')=>`<label>${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}" ${type==='date'?'dir="ltr"':''}></label>`;

export function renderBioFirewallInputs({lang='en',memory={}}={}){
  const m=messages[lang].preflight.biofirewall;
  const hazard=memory.reportedHazard??{};
  const movement=memory.equipmentMovements?.at(-1)??{};
  return `<details class="biofirewall-editor"><summary><span class="eyebrow">${esc(m.eyebrow)}</span><strong>${esc(m.title)}</strong></summary><p class="muted">${esc(m.intro)}</p><p class="biofirewall-demo-note">${esc(m.demoNote)}</p><button type="button" id="bio-demo">${esc(m.demoButton)}</button><div class="biofirewall-input-grid">${input('bio-field-id',m.fieldId,memory.fieldId)}${input('bio-hazard-field-id',m.hazardFieldId,hazard.fieldId)}${select('bio-hazard-id',m.hazardId,[['clubroot',m.clubroot],['other',m.other]],hazard.hazardId??'clubroot')}${input('bio-hazard-name',m.hazardName,hazard.hazardName)}${select('bio-hazard-status',m.evidenceStatus,[['confirmed',m.statuses.confirmed],['suspected',m.statuses.suspected],['no-reported-infection',m.statuses.noReported],['unknown',m.statuses.unknown]],hazard.evidenceStatus??'unknown')}${input('bio-recorded-date',m.recordedDate,hazard.recordedDate,'date')}${input('bio-equipment-id',m.equipmentId,movement.equipmentId)}${input('bio-from-field-id',m.fromFieldId,movement.fromFieldId)}${input('bio-to-field-id',m.toFieldId,movement.toFieldId)}${select('bio-source-use',m.sourceUseConfirmed,[['',m.notKnown],['true',m.yes],['false',m.no]],movement.sourceUseConfirmed===true?'true':movement.sourceUseConfirmed===false?'false':'')}${input('bio-moved-at',m.movedAt,movement.movedAt,'date')}${select('bio-cleaning-status',m.cleaningStatus,[['not-recorded',m.notRecorded],['documented-unvalidated',m.documentedUnvalidated],['unknown',m.cleaningUnknown]],movement.cleaningStatus??'not-recorded')}${input('bio-cleaning-date',m.cleaningDate,movement.cleaningDate,'date')}${input('bio-notes',m.notes,hazard.notes||movement.notes)}</div></details>`;
}

export function renderBioFirewallResults({lang='en',checks=[],hasRun=false}={}){
  const p=messages[lang].preflight,b=p.biofirewall;
  if(!hasRun)return `<section id="biofirewall-results" class="biofirewall-results" aria-labelledby="biofirewall-results-title"><h4 id="biofirewall-results-title">${esc(b.ruleTitle)}</h4><p>${esc(b.runFindings)}</p></section>`;
  const cards=checks.map(check=>{
    const label=p.checkLabels[check.ruleId]??check.ruleId;
    const status=p.explanations?.[check.ruleId]?.[check.status]??check.explanation??check.reason;
    const evidenceLabel=b.statuses[check.evidenceStatus==='potential-exposure'?'potentialExposure':check.evidenceStatus==='no-reported-infection-history'?'noReportedHistory':check.evidenceStatus==='no-supported-equipment-path'?'noPath':check.evidenceStatus]??check.evidenceStatus;
    const primaryFieldLabel=check.ruleId==='biofirewall.reported-hazard'?b.hazardFieldId:b.fieldId;
    const involved=[check.fieldId&&`${primaryFieldLabel}: ${check.fieldId}`,check.sourceFieldId&&`${b.fromFieldId}: ${check.sourceFieldId}`,check.equipmentId&&`${b.equipmentId}: ${check.equipmentId}`].filter(Boolean).map(esc).join(' · ');
    const missing=check.missingInformation?.length?`<p><strong>${esc(p.missing)}:</strong> ${check.missingInformation.map(key=>esc(p.missingLabels[key]??key)).join(' · ')}</p>`:'';
    const sources=(check.sources??[]).map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(b.resultSource)}</a>`).join(' · ')||`${esc(b.ruleTitle)}: ${esc(label)}`;
    return `<article class="preflight-check biofirewall-check" data-status="${esc(check.status)}"><header><span class="preflight-status" data-status="${esc(check.status)}">${esc(p.decision?.[check.status]??messages[lang].decision[check.status])}</span><strong>${esc(label)}</strong></header>${involved?`<p>${involved}</p>`:''}<p><strong>${esc(b.evidenceStatus)}:</strong> ${esc(evidenceLabel)}</p><p>${esc(status)}</p>${missing}<p><strong>${esc(p.nextStep)}:</strong> ${esc(p.nextSteps?.[check.ruleId]??check.nextStep)}</p><p><strong>${esc(p.sources)}:</strong> ${sources}</p></article>`;
  }).join('');
  return `<section id="biofirewall-results" class="biofirewall-results" aria-labelledby="biofirewall-results-title"><h4 id="biofirewall-results-title">${esc(b.ruleTitle)}</h4>${cards||`<p>${esc(b.runFindings)}</p>`}<p class="small muted">${esc(b.reportSourceNote)}</p></section>`;
}
