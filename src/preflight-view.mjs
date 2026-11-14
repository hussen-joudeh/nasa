import {messages} from './i18n.mjs';
import {crops} from './domain.mjs';
import {WATER_SOURCES} from './water-truth.mjs';
import {renderBioFirewallInputs,renderBioFirewallResults} from './biofirewall-view.mjs';

const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cropName=(id,lang)=>Object.hasOwn(crops,id)?crops[id][lang]:messages[lang].unavailable;
const rotationLabel=(lang,index)=>index===0?messages[lang].rotationA:index===1?messages[lang].rotationB:`${messages[lang].rotationLabelPrefix} ${String.fromCharCode(65+index)}`;
const fmt=(value,lang,digits=1)=>new Intl.NumberFormat(lang==='ar'?'ar':'en',{maximumFractionDigits:digits}).format(value);
function statusLabel(status,lang){return messages[lang].decision[status]??status;}
function range(value,unit,lang){
  if(!value||!Number.isFinite(value.min)||!Number.isFinite(value.max))return messages[lang].unavailable;
  const text=Math.abs(value.max-value.min)<1e-8?fmt(value.min,lang):`${fmt(value.min,lang)}–${fmt(value.max,lang)}`;
  return `<bdi>${text} ${esc(unit)}</bdi>`;
}
function sourceLinks(check,lang){
  const found=new Set();
  const visit=value=>{
    if(typeof value==='string'&&/^https:\/\//.test(value))found.add(value);
    else if(Array.isArray(value))value.forEach(visit);
    else if(value&&typeof value==='object')Object.values(value).forEach(visit);
  };
  visit(check.evidence);
  return [...found].map(url=>`<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(new URL(url).hostname)}</a>`).join(' · ')||esc(messages[lang].preflight.noLinkedSource);
}
function localizedExplanation(check,lang){
  const p=messages[lang].preflight;
  const reason=check.evidence?.reason;
  if(check.ruleId.startsWith('rotation.')&&reason)return messages[lang].decision.reasons[reason]??check.explanation;
  return p.explanations?.[check.ruleId]?.[check.status]??check.explanation;
}
function localizedNextStep(check,lang){
  const p=messages[lang].preflight;
  const reason=check.evidence?.reason;
  if(check.ruleId.startsWith('rotation.')&&reason)return p.rotationNextSteps?.[reason]??check.nextStep;
  return p.nextSteps?.[check.ruleId]??check.nextStep;
}
function jsonEvidence(value){
  try{return esc(JSON.stringify(value,null,2));}catch{return '';}
}
function renderCheck(check,lang){
  const p=messages[lang].preflight;
  const label=p.checkLabels[check.ruleId]??check.ruleId;
  const season=check.season?` · ${p.season} ${fmt(check.season,lang,0)}`:'';
  const missing=check.missingInformation?.length?`<p><strong>${esc(p.missing)}:</strong> ${check.missingInformation.map(key=>esc(p.missingLabels[key]??key)).join(' · ')}</p>`:'';
  return `<details class="preflight-check" data-status="${esc(check.status)}"><summary><span class="preflight-status" data-status="${esc(check.status)}">${esc(statusLabel(check.status,lang))}</span><span>${esc(label)}${esc(season)}</span></summary><p>${esc(localizedExplanation(check,lang))}</p><p><strong>${esc(p.inputEvidence)}:</strong></p><pre>${jsonEvidence(check.inputs)}</pre>${missing}<p><strong>${esc(p.nextStep)}:</strong> ${esc(localizedNextStep(check,lang))}</p><p><strong>${esc(p.sources)}:</strong> ${sourceLinks(check,lang)}</p></details>`;
}
function waterBars(season,lang){
 const p=messages[lang].preflight,need=season.needMm,budget=season.budget;
 if(!need||!Number.isFinite(need.max))return '';
 const amount=budget?.unit==='mm'&&budget?.period==='perSeason'&&Number.isFinite(budget.amount)?budget.amount:null;
 const scale=Math.max(need.max,amount??0,1);
 return `<div class="water-bars"><label>${esc(p.irrigationNeed)} · ${range(need,'mm',lang)}<span><i style="width:${Math.max(0,need.max/scale*100)}%"></i></span></label><label>${esc(p.availableBudget)} · ${amount===null?(Number.isFinite(budget?.amount)?fmt(budget.amount,lang)+' '+(budget.unit==='m3'?'m³':'mm'):esc(messages[lang].decision.UNKNOWN)):fmt(amount,lang)+' mm'}${amount===null?'':`<span><i style="width:${Math.max(0,amount/scale*100)}%"></i></span>`}</label></div>`;
}
function renderSeason(season,lang){
  const p=messages[lang].preflight;
  const budget=season.budget?.amount!==undefined?`${fmt(season.budget.amount,lang)} ${season.budget.unit==='m3'?'m³':'mm'}`:messages[lang].unavailable;
  const missing=season.missingInformation?.length?season.missingInformation.map(key=>p.missingLabels[key]??key).join(' · '):'';
  const note=season.needMm?p.seasonEstimateNote:season.missingInformation?.includes('completeCropSeasonWithinNASAObservedPeriod')?p.explanations['water.season-coverage'].UNKNOWN:season.missingInformation?.includes('dailyClimateObservation')?p.explanations['water.daily-completeness'].UNKNOWN:p.explanations['water.season-data'].UNKNOWN;
  const balance=season.deficitMm&&season.deficitMm.max>0
    ?`${p.deficit}: ${range(season.deficitMm,'mm',lang)} / ${range(season.deficitM3,'m³',lang)}`
    :season.remainingMm?`${p.remaining}: ${range(season.remainingMm,'mm',lang)} / ${range(season.remainingM3,'m³',lang)}`
    :season.budget?.period==='wholePlan'?p.budgetComparedAtPlan:p.balanceNotComparable;
  return `<article class="preflight-season"><header><h5>${esc(p.season)} ${fmt(season.season,lang,0)} · ${esc(cropName(season.crop,lang))}</h5><span class="preflight-status" data-status="${esc(season.status)}">${esc(statusLabel(season.status,lang))}</span></header><p>${esc(p.referenceWindow)}: <bdi>${esc(season.plantingDate??messages[lang].unavailable)} — ${esc(season.harvestDate??messages[lang].unavailable)}</bdi></p><dl><div><dt>${esc(p.referenceEto)}</dt><dd>${season.referenceEtoMm===null?messages[lang].unavailable:range({min:season.referenceEtoMm,max:season.referenceEtoMm},'mm',lang)}</dd></div><div><dt>${esc(p.cropEtc)}</dt><dd>${range(season.cropEtcMm,'mm',lang)}</dd></div><div><dt>${esc(p.effectiveRainfall)}</dt><dd>${season.effectivePrecipitationMm===null?messages[lang].unavailable:range({min:season.effectivePrecipitationMm,max:season.effectivePrecipitationMm},'mm',lang)}</dd></div><div><dt>${esc(p.irrigationNeed)}</dt><dd>${range(season.needMm,'mm',lang)} · ${range(season.needM3,'m³',lang)}</dd></div><div><dt>${esc(p.availableBudget)}</dt><dd>${esc(budget)}</dd></div></dl>${note?`<p class="preflight-season-note">${esc(note)}</p>`:''}${missing?`<p class="preflight-season-missing"><strong>${esc(p.missing)}:</strong> ${esc(missing)}</p>`:''}<p>${esc(balance)}</p>${waterBars(season,lang)}${season.assumptions?.length?`<details><summary>${esc(p.assumptions)}</summary><ul>${season.assumptions.map(item=>`<li>${esc(p.assumptionLabels?.[item]??item)}</li>`).join('')}</ul></details>`:''}</article>`;
}
function renderEvaluation(evaluation,index,lang){
  const p=messages[lang].preflight;
  const label=rotationLabel(lang,index);
  const water=evaluation.water;
  const planBudget=water.waterBudget;
  const budgetSummary=planBudget?`${fmt(planBudget.amount,lang)} ${planBudget.unit==='m3'?'m³':'mm'} · ${esc(planBudget.period==='wholePlan'?p.wholePlan:p.perSeason)}`:messages[lang].unavailable;
  const cb=water.budgetComparison;
  const totalNeed=cb.needMm?`${range(cb.needMm,'mm',lang)} · ${range(cb.needM3,'m³',lang)}`:messages[lang].unavailable;
  const totalBalance=cb.period==='perSeason'?p.perSeasonBalancesShown:cb.deficitMm&&cb.deficitMm.max>0?`${p.deficit}: ${range(cb.deficitMm,'mm',lang)} / ${range(cb.deficitM3,'m³',lang)}`:cb.remainingMm?`${p.remaining}: ${range(cb.remainingMm,'mm',lang)} / ${range(cb.remainingM3,'m³',lang)}`:p.balanceNotComparable;
  return `<section class="preflight-evaluation"><header><h4>${esc(label)}</h4><span class="preflight-status" data-status="${esc(evaluation.status)}">${esc(statusLabel(evaluation.status,lang))}</span></header><div class="preflight-summary"><p><strong>${esc(p.overallStatus)}:</strong> ${esc(statusLabel(evaluation.status,lang))}</p><p><strong>${esc(p.statusCounts)}:</strong> ${allStatusCounts(evaluation.statuses,lang)}</p><p><strong>${esc(p.budgetComparison)}:</strong> <span class="preflight-status" data-status="${esc(cb.status)}">${esc(statusLabel(cb.status,lang))}</span></p><p><strong>${esc(p.availableBudget)}:</strong> ${esc(budgetSummary)}</p><p><strong>${esc(p.modeledPlanNeed)}:</strong> ${totalNeed}</p><p>${esc(totalBalance)}</p></div><div class="preflight-seasons">${water.seasons.map(season=>renderSeason(season,lang)).join('')}</div><details class="preflight-all-checks"><summary>${esc(p.allChecks)} (${fmt(evaluation.checks.filter(check=>!check.ruleId.startsWith('biofirewall.')).length,lang,0)})</summary>${evaluation.checks.filter(check=>!check.ruleId.startsWith('biofirewall.')).map(check=>renderCheck(check,lang)).join('')}</details><p class="preflight-method">${esc(p.method)} ${esc(p.methodDescription)}</p><p class="preflight-sources"><strong>${esc(p.sources)}:</strong> <a href="${esc(WATER_SOURCES.fao56)}" target="_blank" rel="noreferrer">FAO-56</a> · <a href="${esc(WATER_SOURCES.faoEffectiveRainfall)}" target="_blank" rel="noreferrer">FAO irrigation manual</a> · <a href="${esc(WATER_SOURCES.nasaPowerDaily)}" target="_blank" rel="noreferrer">NASA POWER daily</a></p></section>`;
}
function allStatusCounts(counts,lang){
  const d=messages[lang].decision;
  return ['PASS','WARNING','FAIL','UNKNOWN'].map(status=>`${esc(d[status])}: ${fmt(counts[status]??0,lang,0)}`).join(' · ');
}
const exact=value=>Number.isFinite(Number(value))?String(Number(value)):'';
function breakpointStatus(status,lang){return messages[lang].decision[status]??status;}
function renderBreakpointChange(change,lang,p){
  const checkLabels=messages[lang].preflight.checkLabels;
  const label=checkLabels[change.ruleId]??p.rules[change.ruleId]??change.ruleId;
  const season=change.season?` · ${p.season} ${fmt(change.season,lang,0)}`:'';
  return `<li>${esc(rotationLabel(lang,change.rotationIndex))}${esc(season)} · ${esc(label)}: <span class="preflight-status" data-status="${esc(change.before)}">${esc(breakpointStatus(change.before,lang))}</span> → <span class="preflight-status" data-status="${esc(change.after)}">${esc(breakpointStatus(change.after,lang))}</span></li>`;
}
function renderBreakpointUpdates(observed,lang,p){
  if(!observed)return '';
  const changed=observed.changed??[];
  const inputs=(observed.changedInputs??[]).map(key=>p.inputLabels[key]??key).join(' · ');
  if(!changed.length)return `<div class="breakpoint-changes"><h5>${esc(p.changesTitle)}</h5><p>${esc(p.noChanges)} ${fmt(observed.unchangedCount??0,lang,0)}.</p>${inputs?`<p>${esc(p.inputsChanged)}: ${esc(inputs)}</p>`:''}</div>`;
  return `<div class="breakpoint-changes"><h5>${esc(p.changesTitle)}</h5>${inputs?`<p>${esc(p.inputsChanged)}: ${esc(inputs)}</p>`:''}<ul>${changed.map(item=>renderBreakpointChange(item,lang,p)).join('')}</ul><p>${fmt(observed.unchangedCount??0,lang,0)} ${esc(p.otherChecksUnchanged)}</p></div>`;
}
export function renderDecisionBreakpoint({lang='en',findings=[],observedChanges=null,hasRun=false}={}){
  const p=messages[lang].preflight.breakpoint;
  const rank={'DECISION-SENSITIVE':0,'STABLE WITHIN TESTED RANGE':1,'INSUFFICIENT EVIDENCE':2};
  const prioritized=[...(Array.isArray(findings)?findings:[])].sort((a,b)=>(rank[a.classification]??3)-(rank[b.classification]??3)||a.rotationIndex-b.rotationIndex||(a.season??0)-(b.season??0)).slice(0,3);
  const cards=prioritized.map(item=>{
    const rule=p.rules[item.ruleId]??messages[lang].preflight.checkLabels[item.ruleId]??item.ruleId;
    const season=item.season?` · ${p.season} ${fmt(item.season,lang,0)}`:'';
    const rangeText=item.testedRange?`${exact(item.testedRange.min)}–${exact(item.testedRange.max)} ${item.testedRange.unit==='m3'?'m³':'mm'} · ${item.testedRange.period==='perSeason'?p.perSeason:p.wholePlan}`:'';
    const thresholdText=item.threshold?`${exact(item.threshold.mm)} mm · ${exact(item.threshold.m3)} m³`:'';
    const transitions=(item.transitions??[]).map(step=>`<li>${esc(p.atBudget)} <bdi>${exact(item.testedRange?.unit==='m3'?step.atM3:step.atMm)} ${item.testedRange?.unit==='m3'?'m³':'mm'}</bdi>: ${esc(breakpointStatus(step.statusAt,lang))}; ${esc(p.justBelow)} ${esc(breakpointStatus(step.statusBelow,lang))}</li>`).join('');
    const missing=item.missingInformation?.length?`<p><strong>${esc(p.missing)}:</strong> ${item.missingInformation.map(key=>esc(messages[lang].preflight.missingLabels[key]??messages[lang].decision.missing[key]??key)).join(' · ')}</p>`:'';
    const action=item.classification==='INSUFFICIENT EVIDENCE'?(messages[lang].preflight.nextSteps[item.ruleId]??messages[lang].preflight.rotationNextSteps?.[item.reason]??p.verifyMissing):p.verifyBudget;
    const detail=item.classification==='DECISION-SENSITIVE'?p.sensitiveDetail:item.classification==='STABLE WITHIN TESTED RANGE'?p.stableDetail:p.insufficientDetail;
    const threshold=item.threshold?`<p><strong>${esc(p.threshold)}:</strong> <bdi>${thresholdText}</bdi> ${item.threshold.inclusive?esc(p.inclusive):''}</p>`:'';
    const tested=rangeText?`<p><strong>${esc(p.testedRange)}:</strong> <bdi>${rangeText}</bdi></p>`:'';
    const status=item.baselineStatus?`<p><strong>${esc(p.currentRuleStatus)}:</strong> ${esc(breakpointStatus(item.baselineStatus,lang))}</p>`:'';
    const states=item.statuses?`<p>${esc(p.rangeOutcomes)}: ${esc(p.lowBudget)} ${esc(breakpointStatus(item.statuses.atMin,lang))} · ${esc(p.highBudget)} ${esc(breakpointStatus(item.statuses.atMax,lang))}</p>`:'';
    return `<article class="breakpoint-finding" data-classification="${esc(item.classification)}"><header><h5>${esc(rotationLabel(lang,item.rotationIndex))}${esc(season)} · ${esc(rule)}</h5><span class="breakpoint-classification">${esc(p.classifications[item.classification]??item.classification)}</span></header><p><strong>${esc(p.uncertainInput)}:</strong> ${esc(item.variable==='waterBudget'?p.availableWater:p.unassessedInput)}</p><p>${esc(detail)}</p>${status}${tested}${threshold}${states}${transitions?`<ul class="breakpoint-transitions">${transitions}</ul>`:''}${missing}<p><strong>${esc(p.verify)}:</strong> ${esc(action)}</p></article>`;
  }).join('');
  const noFindings=prioritized.length?'':`<p>${esc(hasRun?p.noFindings:messages[lang].preflight.notRun)}</p>`;
  return `<section class="decision-breakpoint" aria-labelledby="decision-breakpoint-title"><div class="breakpoint-heading"><div><p class="eyebrow">${esc(p.eyebrow)}</p><h4 id="decision-breakpoint-title">${esc(p.title)}</h4><p class="muted">${esc(p.intro)}</p></div><button type="button" class="breakpoint-demo-button" id="decision-breakpoint-demo">${esc(p.demoButton)}</button></div><p class="breakpoint-demo-note">${esc(p.demoNote)}</p><p id="breakpoint-demo-status" role="status" class="breakpoint-demo-status"></p>${cards||noFindings}${renderBreakpointUpdates(observedChanges,lang,p)}<p class="breakpoint-caution">${esc(p.planCaution)}</p></section>`;
}
export function renderPreflightPanel({lang='en',inputs={},areaHa=null,period=null,evaluations=null,breakpoint=null,biofirewall={}}={}){
  const m=messages[lang],p=m.preflight,budget=inputs.waterBudget??{};
  const dates=Array.isArray(inputs.plantingDates)?inputs.plantingDates:['','',''];
  const periodLabel=period?.startIso&&period?.endIso?`${esc(period.startIso)} — ${esc(period.endIso)}`:esc(p.noClimatePeriod);
  const min=period?.startIso??'',max=period?.endIso??'';
  const hasRun=Array.isArray(evaluations)&&evaluations.length>0;
  const bioChecks=hasRun?(evaluations[0].checks??[]).filter(check=>check.ruleId.startsWith('biofirewall.')):[];
  return `<section class="preflight-panel" aria-labelledby="preflight-title"><div class="preflight-heading"><div><p class="eyebrow">${esc(p.eyebrow)}</p><h3 id="preflight-title">${esc(p.title)}</h3><p class="muted">${esc(p.intro)}</p></div></div><p class="preflight-historical">${esc(p.historicalLabel)}: <bdi>${periodLabel}</bdi> · ${esc(p.historicalNote)}</p><form id="preflight-form"><div class="preflight-input-grid"><label>${esc(p.availableBudget)}<input id="water-budget-amount" type="number" min="0" step="any" inputmode="decimal" dir="ltr" value="${esc(budget.amount??'')}" placeholder="${esc(p.amountPlaceholder)}"></label><label>${esc(p.budgetUnit)}<select id="water-budget-unit"><option value="m3" ${budget.unit==='m3'?'selected':''}>${esc(p.unitVolume)}</option><option value="mm" ${budget.unit==='mm'?'selected':''}>${esc(p.unitDepth)}</option></select></label><label>${esc(p.budgetPeriod)}<select id="water-budget-period"><option value="perSeason" ${budget.period==='perSeason'?'selected':''}>${esc(p.perSeason)}</option><option value="wholePlan" ${budget.period==='wholePlan'?'selected':''}>${esc(p.wholePlan)}</option></select></label><div class="preflight-area"><span>${esc(p.fieldArea)}</span><strong>${areaHa>0?`${fmt(areaHa,lang,2)} ${esc(m.hectares)}`:esc(m.unavailable)}</strong></div></div><fieldset class="preflight-dates"><legend>${esc(p.plantingDates)}</legend>${[0,1,2].map(index=>`<label>${esc(p.season)} ${fmt(index+1,lang,0)}<input id="planting-date-${index+1}" type="date" dir="ltr" min="${esc(min)}" max="${esc(max)}" value="${esc(dates[index]??'')}"></label>`).join('')}</fieldset><div class="preflight-assumptions"><label class="preflight-check-label"><input id="illustrative-crop-settings" type="checkbox" ${inputs.illustrativeCropSettings===true?'checked':''}><span>${esc(p.illustrativeSettings)}</span></label><label class="preflight-check-label"><input id="effective-rainfall-slope-confirmed" type="checkbox" ${inputs.effectiveRainfallSlopeConfirmed===true?'checked':''}><span>${esc(p.slopeConfirmation)}</span></label></div>${renderBioFirewallInputs({lang,memory:biofirewall})}<p class="preflight-basis-note">${esc(p.budgetBasisNote)}</p><button class="primary" id="run-preflight" type="submit">${esc(p.run)}</button></form>${renderBioFirewallResults({lang,checks:bioChecks,hasRun})}<div id="preflight-results" aria-live="polite">${Array.isArray(evaluations)&&evaluations.length?evaluations.map((evaluation,index)=>renderEvaluation(evaluation,index,lang)).join(''):`<p class="preflight-not-run">${esc(p.notRun)}</p>`}${renderDecisionBreakpoint({lang,findings:breakpoint?.findings??[],observedChanges:breakpoint?.observedChanges,hasRun:Array.isArray(evaluations)&&evaluations.length>0})}</div></section>`;
}
