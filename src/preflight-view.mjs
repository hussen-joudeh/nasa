import {messages} from './i18n.mjs';
import {crops} from './domain.mjs';
import {WATER_SOURCES,cubicMetresToMillimetres} from './water-truth.mjs';
import {validateWaterBudgetDraft} from './farmer-inputs.mjs';
import {formatDepthMm,formatVolumeM3,formatRangeDisplay} from './display-format.mjs';
import {renderBioFirewallInputs,renderBioFirewallResults} from './biofirewall-view.mjs';
import {renderDecisionTraceWhy} from './decision-trace-view.mjs';
import {pickPrimaryBreakpointFinding,renderBreakpointThresholdAxis} from './breakpoint-viz.mjs';
import {renderCheckGroups,renderCheckStore,renderMethodFooter,renderOverview,renderProvenanceDrawer,renderRotationStrip,renderStalePreflightResults} from './preflight-ui.mjs';

const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cropName=(id,lang)=>Object.hasOwn(crops,id)?crops[id][lang]:messages[lang].unavailable;
const rotationLabel=(lang,index)=>index===0?messages[lang].rotationA:index===1?messages[lang].rotationB:`${messages[lang].rotationLabelPrefix} ${lang==='ar'&&index===2?'ج':String.fromCharCode(65+index)}`;
const fmt=(value,lang,digits=1)=>new Intl.NumberFormat(lang==='ar'?'ar':'en',{maximumFractionDigits:digits}).format(value);
function statusLabel(status,lang){return messages[lang].decision[status]??status;}
function range(value,unit,lang){
  if(!value||!Number.isFinite(value.min)||!Number.isFinite(value.max))return esc(messages[lang].unavailable);
  const depth=unit==='mm';
  const text=formatRangeDisplay(value.min,value.max,lang,unit,{depth});
  if(!text)return esc(messages[lang].unavailable);
  return `<bdi dir="ltr">${esc(text)} ${esc(unit)}</bdi>`;
}
function balanceLine(prefix,rangeMm,rangeM3,lang){
  if(!rangeMm&&!rangeM3)return '';
  const mm=rangeMm?range(rangeMm,'mm',lang):'';
  const m3=rangeM3?range(rangeM3,'m³',lang):'';
  return `${esc(prefix)}: ${mm}${mm&&m3?' / ':''}${m3}`;
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
const checkHelpers={localizedExplanation,localizedNextStep,jsonEvidence,sourceLinks};
export function renderBudgetConfirmation({lang='en',budget={},areaHa=null}={}){
 const ar=lang==='ar',check=validateWaterBudgetDraft(budget);
 if(check.empty)return `<p>${ar?'لم تُدخل ميزانية الري؛ ستبقى كفاية المياه غير معروفة.':'No irrigation budget entered; water sufficiency will remain unknown.'}</p>`;
 if(!check.valid)return `<p class="error">${esc(messages[lang].farmer.budgetInvalid)}</p>`;
 const scope=check.period==='perSeason'?(ar?'لكل موسم محصول':'per crop season'):(ar?'للخطة كاملة':'for the whole plan');
 const depth=Number.isFinite(budget.mm)?budget.mm:check.unit==='mm'?check.amount:Number.isFinite(areaHa)&&areaHa>0?cubicMetresToMillimetres(check.amount,areaHa):null;
 return `<p>${ar?'الميزانية المدخلة:':'Entered budget:'} <strong><bdi dir="ltr">${esc(check.amount)} ${check.unit==='m3'?'m³':'mm'}</bdi> ${scope}</strong></p><p>${ar?'عمق المياه للمقارنة:':'Comparison depth:'} ${depth===null?esc(ar?'حدد حدود حقل صالحة لتحويل الحجم إلى عمق.':'Select a valid field boundary to convert volume into depth.'):`<strong><bdi dir="ltr">${formatDepthMm(depth,lang)} mm</bdi></strong> ${scope}`}${check.unit==='m3'&&depth!==null?` · ${ar?'باستخدام مساحة الحقل':'using field area'} <bdi dir="ltr">${formatDepthMm(areaHa,lang)} ha</bdi>`:''}</p>${check.period==='wholePlan'?`<p>${ar?'هذا عمق للخطة كاملة، ولا يُخصص بشكل منفصل للموسم الثاني.':'This depth covers the whole plan and is not allocated separately to Season 2.'}</p>`:''}`;
}
export function renderSeasonWaterReason({evaluation,season=2,lang='en'}={}){
 const ar=lang==='ar',result=evaluation.water.seasons.find(item=>item.season===season);
 const check=evaluation.checks.find(item=>item.ruleId==='water.balance'&&item.season===season)??evaluation.checks.find(item=>item.status==='UNKNOWN'&&item.season===season&&item.ruleId.startsWith('water.'));
 if(!check)return `<p>${esc(ar?'لا يتوفر تفسير لهذا الموسم.':'No explanation is available for this season.')}</p>`;
 const conditional=check.status==='WARNING'?`<p class="water-reason-note">${check.inputs?.partialBlock?(ar?'تقدير مشروط: فترة أمطار غير مكتملة.':'Conditional estimate: partial rainfall period.'):(ar?'تقدير مشروط: عدم يقين في النموذج.':'Conditional estimate: model uncertainty.')}</p>`:'';
 return `${conditional}<details class="season-water-reason"><summary>${ar?'لماذا هذه النتيجة؟':'Why this water check?'}</summary><p>${esc(localizedExplanation(check,lang))}</p>${check.inputs?.partialBlock?`<p>${ar?'الفترة الأخيرة للأمطار غير مكتملة؛ تُحتسب الأمطار الفعالة للفترات المكتملة من 30 يوماً فقط.':'The final rainfall period is incomplete; effective rainfall is credited only for complete 30-day blocks.'}</p>`:''}${result?.needMm?`<p>${ar?'الاحتياج المحسوب:':'Modeled requirement:'} ${range(result.needMm,'mm',lang)}</p>`:''}${check.missingInformation?.length?`<p>${esc(messages[lang].preflight.missing)}: ${check.missingInformation.map(key=>esc(messages[lang].preflight.missingLabels[key]??key)).join(' · ')}</p>`:''}<p>${esc(localizedNextStep(check,lang))}</p><p>${sourceLinks(check,lang)}</p></details>`;
}
export function renderSeasonWaterChart({rows=[],budget=null,lang='en'}={}){
 const ar=lang==='ar',hasBudget=Number.isFinite(budget)&&budget>=0;
 const requirements=rows.map(row=>row.season?.needMm?.max).filter(Number.isFinite);
 const maximum=Math.ceil(Math.max(1,...requirements,hasBudget?budget:0)/100)*100;
 const depth=value=>`<bdi dir="ltr">${formatDepthMm(value,lang)} mm</bdi>`;
 return `<figure id="season-water-chart" class="season-water-chart" aria-labelledby="season-water-chart-title" aria-describedby="season-water-chart-note"><figcaption><h3 id="season-water-chart-title">${ar?'الموسم الثاني · الحد الأعلى لاحتياج الري':'Season 2 · Upper irrigation requirement'}</h3>${hasBudget?`<p class="chart-budget-legend"><i aria-hidden="true"></i>${ar?'الميزانية المطبقة':'Applied budget'} <data class="chart-budget" value="${budget}">${depth(budget)}</data></p>`:''}</figcaption><div class="chart-axis" aria-hidden="true">${[0,maximum/2,maximum].map(value=>`<data value="${value}">${depth(value)}</data>`).join('')}</div><div class="chart-plot">${hasBudget?`<span class="chart-budget-line" aria-hidden="true" style="inset-inline-start:${budget/maximum*100}%"></span>`:''}<ol class="chart-bars">${rows.map(({index,season,check})=>{
  const need=season?.needMm?.max,available=Number.isFinite(need),margin=season?.remainingMm?.min;
  return `<li data-chart-plan="${String.fromCharCode(65+index)}"><div class="chart-row-label"><span><bdi>${String.fromCharCode(65+index)}</bdi> · ${esc(cropName(season?.crop,lang))} · <data class="chart-requirement" value="${available?need:''}">${available?depth(need):esc(messages[lang].unavailable)}</data> <span class="preflight-status chart-water-status" data-status="${esc(check?.status??'UNKNOWN')}">${esc(statusLabel(check?.status??'UNKNOWN',lang))}</span></span>${hasBudget&&Number.isFinite(margin)?`<data class="chart-balance" value="${margin}"><bdi dir="ltr">${margin<0?'−':'+'}${formatDepthMm(margin<0?season.deficitMm.max:margin,lang)} mm</bdi> ${margin<0?(ar?'عجز مقابل التقدير الأعلى':'shortfall vs upper estimate'):(ar?'فائض مقابل التقدير الأعلى':'margin vs upper estimate')}</data>`:''}</div><div class="chart-track" aria-hidden="true">${available?`<span class="chart-bar" style="width:${need/maximum*100}%"></span>`:''}</div></li>`;
 }).join('')}</ol></div><p id="season-water-chart-note" class="small muted">${hasBudget?(ar?'الأعمدة تبدأ من الصفر. الفروق مقابل التقدير الأعلى؛ تبقى التحذيرات المشروطة موضحة في الجدول.':'Bars start at zero. Balances are against the upper estimate; conditional warnings remain explained in the table.'):(ar?'أدخل ميزانية ري لكل موسم لإظهار خط المقارنة. الأعمدة تبدأ من الصفر.':'Enter a seasonal irrigation budget to show the comparison line. Bars start at zero.')}</p></figure>`;
}
function waterBars(season,lang){
 const p=messages[lang].preflight,need=season.needMm,budget=season.budget;
 if(!need||!Number.isFinite(need.max))return '';
 const amount=budget?.unit==='mm'&&budget?.period==='perSeason'&&Number.isFinite(budget.amount)?budget.amount:null;
 const scale=Math.max(need.max,amount??0,1);
 return `<div class="water-bars"><label>${esc(p.irrigationNeed)} · ${range(need,'mm',lang)}<span><i style="width:${Math.max(0,need.max/scale*100)}%"></i></span></label><label>${esc(p.availableBudget)} · ${amount===null?(Number.isFinite(budget?.amount)?fmt(budget.amount,lang)+' '+(budget.unit==='m3'?'m³':'mm'):esc(messages[lang].decision.UNKNOWN)):fmt(amount,lang)+' mm'}${amount===null?'':`<span><i style="width:${Math.max(0,amount/scale*100)}%"></i></span>`}</label></div>`;
}
function renderSeason(season,lang,showMissing=true){
  const p=messages[lang].preflight;
  const budget=season.budget?.amount!==undefined?`${fmt(season.budget.amount,lang)} ${season.budget.unit==='m3'?'m³':'mm'}`:messages[lang].unavailable;
  const missing=showMissing&&season.missingInformation?.length?season.missingInformation.map(key=>p.missingLabels[key]??key).join(' · '):'';
  const note=season.needMm?p.seasonEstimateNote:season.missingInformation?.includes('completeCropSeasonWithinNASAObservedPeriod')?p.explanations['water.season-coverage'].UNKNOWN:season.missingInformation?.includes('dailyClimateObservation')?p.explanations['water.daily-completeness'].UNKNOWN:p.explanations['water.season-data'].UNKNOWN;
  const balance=season.deficitMm&&season.deficitMm.max>0
    ?balanceLine(p.deficit,season.deficitMm,season.deficitM3,lang)
    :season.remainingMm?balanceLine(p.remaining,season.remainingMm,season.remainingM3,lang)
    :esc(season.budget?.period==='wholePlan'?p.budgetComparedAtPlan:p.balanceNotComparable);
  const summaryBadge=`<span class="preflight-status preflight-season-summary" data-status="${esc(season.status)}" title="${esc(p.seasonSummaryHint)}">${esc(p.seasonSummary)}: ${esc(statusLabel(season.status,lang))}</span>`;
  const budgetBadge=season.budgetStatus&&season.budgetStatus!==season.status
    ?`<span class="preflight-status preflight-season-budget-rule" data-status="${esc(season.budgetStatus)}" title="${esc(p.seasonBudgetRuleHint)}">${esc(p.seasonBudgetRule)}: ${esc(statusLabel(season.budgetStatus,lang))}</span>`
    :'';
  return `<article class="preflight-season"><header><h5>${esc(p.season)} ${fmt(season.season,lang,0)} · ${esc(cropName(season.crop,lang))}</h5><div class="preflight-season-badges">${summaryBadge}${budgetBadge}</div></header><p>${esc(p.referenceWindow)}: <bdi dir="ltr">${esc(season.plantingDate??messages[lang].unavailable)} — ${esc(season.harvestDate??messages[lang].unavailable)}</bdi></p><dl><div><dt>${esc(p.referenceEto)}</dt><dd>${season.referenceEtoMm===null?esc(messages[lang].unavailable):range({min:season.referenceEtoMm,max:season.referenceEtoMm},'mm',lang)}</dd></div><div><dt>${esc(p.cropEtc)}</dt><dd>${range(season.cropEtcMm,'mm',lang)}</dd></div><div><dt>${esc(p.effectiveRainfall)}</dt><dd>${season.effectivePrecipitationMm===null?esc(messages[lang].unavailable):range({min:season.effectivePrecipitationMm,max:season.effectivePrecipitationMm},'mm',lang)}</dd></div><div><dt>${esc(p.irrigationNeed)}</dt><dd>${range(season.needMm,'mm',lang)} · ${range(season.needM3,'m³',lang)}</dd></div><div><dt>${esc(p.availableBudget)}</dt><dd><bdi dir="ltr">${esc(budget)}</bdi></dd></div></dl>${note?`<p class="preflight-season-note">${esc(note)}</p>`:''}${missing?`<p class="preflight-season-missing"><strong>${esc(p.missing)}:</strong> ${esc(missing)}</p>`:''}${balance?`<p>${balance}</p>`:''}${waterBars(season,lang)}${season.assumptions?.length?`<details><summary>${esc(p.assumptions)}</summary><ul>${season.assumptions.map(item=>`<li>${esc(p.assumptionLabels?.[item]??item)}</li>`).join('')}</ul></details>`:''}</article>`;
}
function renderWaterSummary(evaluation,lang){
  const p=messages[lang].preflight;
  const water=evaluation.water;
  const planBudget=water.waterBudget;
  const budgetSummary=planBudget?`${fmt(planBudget.amount,lang)} ${planBudget.unit==='m3'?'m³':'mm'} · ${esc(planBudget.period==='wholePlan'?p.wholePlan:p.perSeason)}`:messages[lang].unavailable;
  const cb=water.budgetComparison;
  const totalNeed=cb.needMm?`${range(cb.needMm,'mm',lang)} · ${range(cb.needM3,'m³',lang)}`:messages[lang].unavailable;
  const totalBalance=cb.period==='perSeason'?esc(p.perSeasonBalancesShown):cb.deficitMm&&cb.deficitMm.max>0?balanceLine(p.deficit,cb.deficitMm,cb.deficitM3,lang):cb.remainingMm?balanceLine(p.remaining,cb.remainingMm,cb.remainingM3,lang):esc(p.balanceNotComparable);
  return `<div class="preflight-summary"><p><strong>${esc(p.budgetComparison)}:</strong> <span class="preflight-status" data-status="${esc(cb.status)}">${esc(statusLabel(cb.status,lang))}</span></p><p><strong>${esc(p.availableBudget)}:</strong> ${esc(budgetSummary)}</p><p><strong>${esc(p.modeledPlanNeed)}:</strong> ${totalNeed}</p><p>${totalBalance}</p></div>`;
}
function renderEvaluation(evaluation,index,lang,trace=null,selected=0,dashboard=false){
  const p=messages[lang].preflight;
  const label=rotationLabel(lang,index);
  const hidden=index!==selected?' hidden':'';
  return `<section class="preflight-evaluation" data-rotation="${index}"${hidden}><header class="preflight-evaluation-head"><h4>${esc(label)}</h4><a class="preflight-seasons-link" href="#preflight-seasons-${index}">${esc(p.seasonBreakdown)}</a></header>${renderWaterSummary(evaluation,lang)}<div id="preflight-seasons-${index}" class="preflight-seasons"><details class="preflight-seasons-pack" open><summary>${esc(p.seasonBreakdown)} (${fmt(evaluation.water.seasons.length,lang,0)})</summary>${evaluation.water.seasons.map(season=>renderSeason(season,lang,!dashboard)).join('')}</details></div>${trace?`<details class="preflight-trace-pack"><summary>${esc(messages[lang].trace.whyTitle)}</summary>${renderDecisionTraceWhy(trace,lang)}</details>`:''}</section>`;
}
export function renderSharedMissingInputs(evaluations,lang='en'){
 const p=messages[lang].preflight,groups=new Map();
 evaluations.forEach((evaluation,index)=>(evaluation.checks??[]).forEach(check=>(check.missingInformation??[]).forEach(key=>{
  if(!groups.has(key))groups.set(key,new Map());
  const plans=groups.get(key);if(!plans.has(index))plans.set(index,new Set());
  plans.get(index).add(check.season??'plan');
 })));
 if(!groups.size)return '';
 return `<section class="shared-missing-inputs" aria-labelledby="shared-missing-title"><h3 id="shared-missing-title">${lang==='ar'?'المدخلات الناقصة · جميع الخطط':'Missing inputs · all plans'}</h3><ul>${[...groups].map(([key,plans])=>{
  const affected=[...plans].map(([index,seasons])=>{
   const numbered=[...seasons].filter(season=>season!=='plan').sort((a,b)=>a-b);
   const scope=[seasons.has('plan')?(lang==='ar'?'الخطة كاملة':'whole plan'):'',numbered.length?`${esc(p.season)} <bdi>${numbered.map(season=>fmt(season,lang,0)).join(', ')}</bdi>`:''].filter(Boolean).join(' · ');
   return `<bdi><bdi>${String.fromCharCode(65+index)}</bdi> · ${scope}</bdi>`;
  }).join(' / ');
  return `<li data-missing-input="${esc(key)}"><strong>${esc(p.missingLabels[key]??messages[lang].decision.missing[key]??p.missing)}</strong><span>${affected}</span></li>`;
 }).join('')}</ul></section>`;
}
export function renderPreflightResultsSection({lang='en',inputs={},areaHa=null,period=null,evaluations=[],breakpoint=null,decisionTraces=null,selectedRotation=0,dashboard=false}={}){
  const budget=inputs.waterBudget??{};
  const hasRun=Array.isArray(evaluations)&&evaluations.length>0;
  if(!hasRun){
    return `<p class="preflight-not-run">${esc(messages[lang].preflight.notRun)}</p>${renderDecisionBreakpoint({lang,findings:breakpoint?.findings??[],observedChanges:breakpoint?.observedChanges,hasRun:false,evaluation:null,waterBudget:budget,areaHa,period,inputs})}`;
  }
  const selected=Math.min(Math.max(0,selectedRotation),evaluations.length-1);
  const findings=breakpoint?.findings??[],observed=breakpoint?.observedChanges;
  const observedChanges=dashboard&&observed?{...observed,changed:observed.changed.filter(item=>item.rotationIndex===selected),unchangedCount:null}:observed;
  const breakpointBlock=renderDecisionBreakpoint({lang,findings:dashboard?findings.filter(item=>item.rotationIndex===selected):findings,observedChanges,hasRun:true,evaluation:evaluations[selected],waterBudget:budget,areaHa,period,inputs});
  if(dashboard)return `<div class="preflight-results-hub" data-stale="0"><label class="dashboard-plan-picker" for="dashboard-plan-select">${lang==='ar'?'الخطة المحددة':'Selected plan'}<select id="dashboard-plan-select">${evaluations.map((_,index)=>`<option value="${index}" ${index===selected?'selected':''}>${esc(rotationLabel(lang,index))}</option>`).join('')}</select></label>${renderSharedMissingInputs(evaluations,lang)}${renderCheckGroups(evaluations[selected],selected,lang,selected)}${renderEvaluation(evaluations[selected],selected,lang,decisionTraces?.[selected]??null,selected,true)}<details class="dashboard-evidence"><summary>${lang==='ar'?'حساسية القرار والافتراضات':'Decision sensitivity and assumptions'}</summary>${breakpointBlock}</details>${renderCheckStore(evaluations,lang,checkHelpers)}${renderProvenanceDrawer(lang)}<details class="dashboard-evidence"><summary>${lang==='ar'?'طرق الحساب والمراجع':'Calculation methods and citations'}</summary>${renderMethodFooter(lang)}</details></div>`;
  return `<div class="preflight-results-hub" data-stale="0">${renderRotationStrip(evaluations,lang,selected)}${evaluations.map((evaluation,index)=>renderOverview(evaluation,index,lang,selected)).join('')}<div class="preflight-breakpoint-anchor" id="preflight-breakpoint-anchor">${breakpointBlock}</div>${evaluations.map((evaluation,index)=>renderEvaluation(evaluation,index,lang,decisionTraces?.[index]??null,selected)).join('')}${evaluations.map((evaluation,index)=>renderCheckGroups(evaluation,index,lang,selected)).join('')}${renderCheckStore(evaluations,lang,checkHelpers)}${renderProvenanceDrawer(lang)}${renderMethodFooter(lang)}</div>`;
}
export {renderStalePreflightResults};
function allStatusCounts(counts,lang){
  const d=messages[lang].decision;
  return ['PASS','WARNING','FAIL','UNKNOWN'].map(status=>`${esc(d[status])}: ${fmt(counts[status]??0,lang,0)}`).join(' · ');
}
function breakpointStatus(status,lang){return messages[lang].decision[status]??status;}
function formatBreakpointAmount(value,unit,lang){
  if(!Number.isFinite(Number(value)))return '';
  return unit==='m3'?`${formatVolumeM3(value,lang)} m³`:`${formatDepthMm(value,lang)} mm`;
}
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
  const unchanged=Number.isFinite(observed.unchangedCount)?`<p>${fmt(observed.unchangedCount,lang,0)} ${esc(p.otherChecksUnchanged)}</p>`:'';
  if(!changed.length)return `<div class="breakpoint-changes"><h5>${esc(p.changesTitle)}</h5><p>${Number.isFinite(observed.unchangedCount)?`${esc(p.noChanges)} ${fmt(observed.unchangedCount,lang,0)}.`:lang==='ar'?'لم تتغير حالة أي قاعدة للخطة المحددة.':'No rule status changed for the selected plan.'}</p>${inputs?`<p>${esc(p.inputsChanged)}: ${esc(inputs)}</p>`:''}</div>`;
  return `<div class="breakpoint-changes"><h5>${esc(p.changesTitle)}</h5>${inputs?`<p>${esc(p.inputsChanged)}: ${esc(inputs)}</p>`:''}<ul>${changed.map(item=>renderBreakpointChange(item,lang,p)).join('')}</ul>${unchanged}</div>`;
}
export function renderDecisionBreakpoint({lang='en',findings=[],observedChanges=null,hasRun=false,evaluation=null,waterBudget=null,areaHa=null,period=null,inputs=null}={}){
  const p=messages[lang].preflight.breakpoint;
  const rank={'DECISION-SENSITIVE':0,'STABLE WITHIN TESTED RANGE':1,'INSUFFICIENT EVIDENCE':2};
  const prioritized=[...(Array.isArray(findings)?findings:[])].sort((a,b)=>(rank[a.classification]??3)-(rank[b.classification]??3)||a.rotationIndex-b.rotationIndex||(a.season??0)-(b.season??0)).slice(0,3);
  const primary=pickPrimaryBreakpointFinding(prioritized);
  const axis=renderBreakpointThresholdAxis({lang,finding:primary,evaluation,waterBudget,areaHa,period,inputs,observedChanges});
  const cards=prioritized.map(item=>{
    const rule=p.rules[item.ruleId]??messages[lang].preflight.checkLabels[item.ruleId]??item.ruleId;
    const season=item.season?` · ${p.season} ${fmt(item.season,lang,0)}`:'';
    const unit=item.testedRange?.unit==='m3'?'m3':'mm';
    const rangeText=item.testedRange?`<bdi dir="ltr">${esc(formatBreakpointAmount(item.testedRange.min,unit,lang))}–${esc(formatBreakpointAmount(item.testedRange.max,unit,lang))} · ${esc(item.testedRange.period==='perSeason'?p.perSeason:p.wholePlan)}</bdi>`:'';
    const thresholdText=item.threshold?`<bdi dir="ltr">${esc(formatDepthMm(item.threshold.mm,lang))} mm · ${esc(formatVolumeM3(item.threshold.m3,lang))} m³</bdi>`:'';
    const transitions=(item.transitions??[]).map(step=>`<li>${esc(p.atBudget)} <bdi dir="ltr">${esc(formatBreakpointAmount(item.testedRange?.unit==='m3'?step.atM3:step.atMm,unit,lang))}</bdi>: ${esc(breakpointStatus(step.statusAt,lang))}; ${esc(p.justBelow)} ${esc(breakpointStatus(step.statusBelow,lang))}</li>`).join('');
    const missing=item.missingInformation?.length?`<p><strong>${esc(p.missing)}:</strong> ${item.missingInformation.map(key=>esc(messages[lang].preflight.missingLabels[key]??messages[lang].decision.missing[key]??key)).join(' · ')}</p>`:'';
    const action=item.classification==='INSUFFICIENT EVIDENCE'?(messages[lang].preflight.nextSteps[item.ruleId]??messages[lang].preflight.rotationNextSteps?.[item.reason]??p.verifyMissing):p.verifyBudget;
    const detail=item.classification==='DECISION-SENSITIVE'?p.sensitiveDetail:item.classification==='STABLE WITHIN TESTED RANGE'?p.stableDetail:p.insufficientDetail;
    const threshold=item.threshold?`<p><strong>${esc(p.threshold)}:</strong> ${thresholdText} ${item.threshold.inclusive?esc(p.inclusive):''}</p>`:'';
    const tested=rangeText?`<p><strong>${esc(p.testedRange)}:</strong> ${rangeText}</p>`:'';
    const status=item.baselineStatus?`<p><strong>${esc(p.currentRuleStatus)}:</strong> ${esc(breakpointStatus(item.baselineStatus,lang))}</p>`:'';
    const states=item.statuses?`<p>${esc(p.rangeOutcomes)}: ${esc(p.lowBudget)} ${esc(breakpointStatus(item.statuses.atMin,lang))} · ${esc(p.highBudget)} ${esc(breakpointStatus(item.statuses.atMax,lang))}</p>`:'';
    const body=`<p><strong>${esc(p.uncertainInput)}:</strong> ${esc(item.variable==='waterBudget'?p.availableWater:p.unassessedInput)}</p><p>${esc(detail)}</p>${status}${tested}${threshold}${states}${transitions?`<ul class="breakpoint-transitions">${transitions}</ul>`:''}${missing}<p><strong>${esc(p.verify)}:</strong> ${esc(action)}</p>`;
    return `<article class="breakpoint-finding" data-classification="${esc(item.classification)}"><header><h5>${esc(rotationLabel(lang,item.rotationIndex))}${esc(season)} · ${esc(rule)}</h5><span class="breakpoint-classification">${esc(p.classifications[item.classification]??item.classification)}</span></header><details class="breakpoint-finding-detail" open><summary>${esc(p.viz?.technicalDetail??p.verify)}</summary>${body}</details></article>`;
  }).join('');
  const noFindings=prioritized.length?'':`<p>${esc(hasRun?p.noFindings:messages[lang].preflight.notRun)}</p>`;
  return `<section class="decision-breakpoint" aria-labelledby="decision-breakpoint-title"><div class="breakpoint-heading"><div><p class="eyebrow">${esc(p.eyebrow)}</p><h4 id="decision-breakpoint-title">${esc(p.title)}</h4><p class="muted">${esc(p.intro)}</p></div><button type="button" class="breakpoint-demo-button" id="decision-breakpoint-demo">${esc(p.demoButton)}</button></div><p class="breakpoint-demo-note">${esc(p.demoNote)}</p><p id="breakpoint-demo-status" role="status" class="breakpoint-demo-status"></p>${axis}${cards||noFindings}${renderBreakpointUpdates(observedChanges,lang,p)}<p class="breakpoint-caution">${esc(p.planCaution)}</p></section>`;
}
export function renderSnapshotValidityNotice(lang='en',validity=null){
  if(!validity?.state)return '';
  const t=messages[lang].snapshotValidity;
  const text=t[validity.state]??validity.state;
  return `<p class="snapshot-validity snapshot-validity--${esc(validity.state)}" role="status">${esc(text)}</p>`;
}
export function renderPreflightPanel({lang='en',inputs={},areaHa=null,period=null,evaluations=null,breakpoint=null,biofirewall={},decisionTraces=null,snapshotValidity=null,selectedRotation=0,dashboard=false}={}){
  const m=messages[lang],p=m.preflight,budget=inputs.waterBudget??{};
  const dates=Array.isArray(inputs.plantingDates)?inputs.plantingDates:['','',''];
  const periodLabel=period?.startIso&&period?.endIso?`${esc(period.startIso)} — ${esc(period.endIso)}`:esc(p.noClimatePeriod);
  const min=period?.startIso??'',max=period?.endIso??'';
  const hasRun=Array.isArray(evaluations)&&evaluations.length>0;
  const bioChecks=hasRun?(evaluations[dashboard?selectedRotation:0].checks??[]).filter(check=>check.ruleId.startsWith('biofirewall.')):[];
  return `<section class="preflight-panel" aria-labelledby="preflight-title"><h3 id="preflight-title">${lang==='ar'?'إعدادات المقارنة':'Comparison settings'}</h3>${snapshotValidity?.state==='STALE'?`<p class="snapshot-validity snapshot-validity--STALE" role="status">${lang==='ar'?'تغيّرت المدخلات. قارن الخطط لتحديث لوحة النتائج.':'Inputs changed. Compare plans to update the dashboard.'}</p>`:renderSnapshotValidityNotice(lang,snapshotValidity)}<form id="preflight-form"><div class="setup-scenario"><p><strong>${lang==='ar'?'سيناريو توضيحي':'Illustrative scenario'}</strong> · ${lang==='ar'?'طبّق تواريخ المثال وافتراضاته. يمكنك تعديلها؛ وهي ليست قياسات للحقل.':'Apply the reference dates and model assumptions used in the demo. These are editable examples, not measured field conditions.'}</p><div class="setup-scenario-actions"><button type="button" id="illustrative-scenario">${lang==='ar'?'تطبيق السيناريو التوضيحي':'Apply illustrative scenario'}</button><button type="button" id="demo-budget">${lang==='ar'?'استخدم ميزانية المثال 600 مم':'Use 600 mm demo budget'}</button></div></div><details class="setup-assumptions"><summary>${lang==='ar'?'تواريخ المثال وافتراضات النموذج':'Reference dates and model assumptions'}<span class="assumptions-state">${inputs.illustrativeCropSettings&&inputs.effectiveRainfallSlopeConfirmed?(lang==='ar'?'الافتراضات التوضيحية مفعّلة':'Illustrative assumptions active'):(lang==='ar'?'راجع الإعدادات':'Review settings')}</span></summary><p class="preflight-historical">${esc(p.historicalLabel)}: <bdi>${periodLabel}</bdi> · ${esc(p.historicalNote)}</p><fieldset class="preflight-dates"><legend>${esc(p.plantingDates)}</legend>${[0,1,2].map(index=>`<label>${esc(p.season)} ${fmt(index+1,lang,0)}<input id="planting-date-${index+1}" type="date" dir="ltr" min="${esc(min)}" max="${esc(max)}" value="${esc(dates[index]??'')}"></label>`).join('')}</fieldset><div class="preflight-assumptions"><label class="preflight-check-label"><input id="illustrative-crop-settings" type="checkbox" ${inputs.illustrativeCropSettings===true?'checked':''}><span>${esc(p.illustrativeSettings)}</span></label><label class="preflight-check-label"><input id="effective-rainfall-slope-confirmed" type="checkbox" ${inputs.effectiveRainfallSlopeConfirmed===true?'checked':''}><span>${esc(p.slopeConfirmation)}</span></label></div><p class="small muted">${lang==='ar'?'تبخر مرجعي بطريقة هارغريفز–ساماني؛ مراحل ومعاملات FAO-56 توضيحية؛ وأمطار فعالة في فترات مكتملة من 30 يوماً. تأكيد الانحدار افتراض توضيحي لا قياس. تستخدم كل نافذة الفترة المرصودة؛ وهي أمثلة تاريخية منفصلة وليست توقعات لثلاث سنوات.':'Hargreaves–Samani evapotranspiration; illustrative FAO-56 crop stages and coefficients; effective rain in complete 30-day blocks. The slope confirmation is an illustrative assumption, not a measurement. Each window uses the observed period; these are separate historical analogues, not a three-year forecast.'}</p></details><details class="setup-additional"><summary>${lang==='ar'?'سجلات الآفات والمعدات':'Hazard and equipment records'}</summary>${renderBioFirewallInputs({lang,memory:biofirewall})}</details><div class="budget-action"><h3>${lang==='ar'?'ميزانية الري':'Irrigation budget'}</h3><div class="preflight-input-grid" role="group" aria-label="${lang==='ar'?'كمية الري ووحدته ونطاقه':'Irrigation amount, unit and scope'}"><label>${esc(p.availableBudget)}<input id="water-budget-amount" type="number" min="0" step="any" inputmode="decimal" dir="ltr" value="${esc(budget.amount??'')}" placeholder="${esc(p.amountPlaceholder)}"></label><label>${esc(p.budgetUnit)}<select id="water-budget-unit"><option value="m3" ${budget.unit==='m3'?'selected':''}>${esc(p.unitVolume)}</option><option value="mm" ${budget.unit==='mm'?'selected':''}>${esc(p.unitDepth)}</option></select></label><label>${esc(p.budgetPeriod)}<select id="water-budget-period"><option value="perSeason" ${budget.period==='perSeason'?'selected':''}>${esc(p.perSeason)}</option><option value="wholePlan" ${budget.period==='wholePlan'?'selected':''}>${esc(p.wholePlan)}</option></select></label><div class="preflight-area"><span>${esc(p.fieldArea)}</span><strong>${areaHa>0?`${fmt(areaHa,lang,2)} ${esc(m.hectares)}`:esc(m.unavailable)}</strong><p class="muted small preflight-area-note">${esc(p.areaWaterTruthNote)}</p></div></div><p class="small muted">${lang==='ar'?'ميزانية المثال توضيحية. عدّل الكمية والوحدة، أو اترك الكمية فارغة للمقارنة بميزانية غير معروفة.':'The demo budget is illustrative. Edit the amount and unit, or leave the amount blank to compare with an unknown budget.'}</p><div id="water-budget-confirmation" class="budget-confirmation" role="status" aria-live="polite">${renderBudgetConfirmation({lang,budget,areaHa})}</div><p class="preflight-basis-note">${esc(p.budgetBasisNote)}</p><p id="water-budget-error" class="error" role="status" hidden></p><button class="primary" id="run-preflight" type="submit">${lang==='ar'?'قارن الخطط':'Compare plans'}</button></div></form>${renderBioFirewallResults({lang,checks:bioChecks,hasRun,showMissing:!dashboard})}<div id="preflight-results" aria-live="polite">${renderPreflightResultsSection({lang,inputs,areaHa,period,evaluations,breakpoint,decisionTraces,selectedRotation,dashboard})}</div></section>`;
}
