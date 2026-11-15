import {messages} from './i18n.mjs';
import {crops} from './domain.mjs';
// Rotation planner views. Pure string renderers: every value comes from the rotation engine's checks or the crop catalog.
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cropName=(id,lang)=>Object.hasOwn(crops,id)?crops[id][lang]:messages[lang].unavailable;
const rotationLabel=(lang,index)=>index===0?messages[lang].rotationA:index===1?messages[lang].rotationB:`${messages[lang].rotationLabelPrefix} ${lang==='ar'&&index===2?'ج':String.fromCharCode(65+index)}`;
const letter=index=>String.fromCharCode(65+index);
const fmt=(lang,n)=>new Intl.NumberFormat(lang==='ar'?'ar':'en',{maximumFractionDigits:0}).format(n);
const arrow=lang=>lang==='ar'?'←':'→';
const GLYPH={PASS:'✓',WARNING:'!',UNKNOWN:'?',FAIL:'×'};
const mark=(status,lang)=>'<span class="mark" data-status="'+status+'" aria-hidden="true">'+GLYPH[status]+'</span><span class="sr-only">'+esc(messages[lang].decision[status])+': </span>';
const LINK='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11m-4-4 4 4-4 4"/></svg>';
const STAT_LABEL={families:'families',repeats:'repeats',legumes:'legumes'};
/** Counts read from one engine evaluation. null means the engine produced no such check (invalid sequence). */
export function planFacts(evaluation){
 const checks=Array.isArray(evaluation?.checks)?evaluation.checks:[],by=id=>checks.filter(c=>c.id===id),count=result=>checks.filter(c=>c.result===result).length;
 const diversity=by('diversity')[0],legume=by('legume')[0],adjacent=by('family');
 return {
  families:Array.isArray(diversity?.inputs?.families)?diversity.inputs.families.length:null,
  repeats:adjacent.length?adjacent.filter(c=>c.result==='WARNING').length:null,
  legumes:Array.isArray(legume?.inputs?.legumes)?legume.inputs.legumes.length:null,
  history:by('history')[0]?.result??null,
  status:{families:diversity?.result??'UNKNOWN',repeats:adjacent.length?(adjacent.some(c=>c.result==='WARNING')?'WARNING':'PASS'):'UNKNOWN',legumes:legume?.result??'UNKNOWN'},
  warnings:count('WARNING'),unresolved:count('UNKNOWN'),failed:count('FAIL')
 };
}
/** Which counts moved between two evaluations of the same plan. */
export function planChange(before,after){
 const a=planFacts(before),b=planFacts(after);
 return ['families','repeats','legumes','warnings'].filter(key=>a[key]!==b[key]).map(key=>({key,from:a[key],to:b[key]}));
}
function evidence(check,lang){
 const m=messages[lang],d=m.decision,i=check.inputs;
 const sequence=i.sequence??(i.crop?[...(i.previousCrop?[i.previousCrop]:[]),i.crop]:i.legumes);
 let html=sequence?'<p>'+sequence.map(id=>esc(cropName(id,lang))).join(' '+arrow(lang)+' ')+'</p>':'';
 if(i.families)html+='<p>'+i.families.map(f=>esc(d.families[f])).join(' · ')+'</p>';
 if(i.observations){
  html+='<p>'+esc(m.nasaPeriod)+': <bdi>'+esc(i.period?.startIso??m.unavailable)+' — '+esc(i.period?.endIso??m.unavailable)+'</bdi></p>';
  html+='<p>'+esc(m.nasaResolution)+' · '+esc(m.nasaHistorical)+'</p>';
  html+='<ul>'+Object.entries(i.observations).map(([key,o])=>'<li>'+esc({precipitation:d.periodTotal,temperatureMax:m.nasaTempMax,temperatureMin:m.nasaTempMin}[key])+': '+esc(o.value===null?m.unavailable:new Intl.NumberFormat(lang,{maximumFractionDigits:2}).format(o.value)+' '+o.unit)+'; '+esc(d.validDays)+': '+esc(o.validDays)+'</li>').join('')+'</ul>';
 }
 return html;
}
export function renderDecisionChecks(evaluation,lang,index=0){
 const m=messages[lang],d=m.decision,facts=planFacts(evaluation),plan=letter(index);
 return '<details class="plan-evidence" data-k="evidence-'+plan+'"><summary><span>'+esc(d.checks)+'</span><small>'+esc(fmt(lang,facts.warnings))+' '+esc(d.WARNING)+' · '+esc(fmt(lang,facts.unresolved))+' '+esc(d.UNKNOWN)+'</small></summary><div class="plan-evidence-list">'+evaluation.checks.map((c,n)=>'<details data-k="check-'+plan+'-'+n+'" data-status="'+esc(c.result)+'"><summary>'+mark(c.result,lang)+'<span>'+esc(d.labels[c.id])+' · '+esc(c.season?m.season+' '+fmt(lang,c.season):d.wholePlan)+'</span><strong>'+esc(d[c.result])+'</strong></summary><p>'+esc(d.reasons[c.reason])+'</p>'+evidence(c,lang)+(c.missing.length?'<p>'+esc(d.missingLabel)+': '+c.missing.map(k=>esc(d.missing[k])).join(lang==='ar'?'؛ ':'; ')+'</p>':'')+'<p>'+esc(d.evidence)+': '+(c.source.startsWith('https://')?'<a href="'+esc(c.source)+'" target="_blank" rel="noreferrer">'+esc(new URL(c.source).hostname)+'</a>':esc(d.contract))+'</p></details>').join('')+'</div></details>';
}
/** One plan as a lane: identity, a three-season track with editable crops and family context, then what the engine flags. */
export function renderPlanLane(evaluation,index,lang,change=null){
 const m=messages[lang],d=m.decision,facts=planFacts(evaluation),plan=letter(index),name=rotationLabel(lang,index);
 const sequence=Array.isArray(evaluation?.sequence)?evaluation.sequence:[];
 const changed=new Set((change?.items??[]).map(item=>item.key));
 const track=sequence.map((crop,season)=>{
  const known=Object.hasOwn(crops,crop),link=season?evaluation.checks.find(c=>c.id==='family'&&c.season===season+1):null,repeat=link?.result==='WARNING',id='rotation-'+index+'-'+season;
  return '<li class="lane-season" data-family="'+(known?esc(crops[crop].family):'')+'"'+(repeat?' data-repeat="true"':'')+'>'+(link?'<span class="lane-link" data-result="'+esc(link.result)+'">'+LINK+'</span>':'')+
   '<label for="'+id+'">'+esc(m.season)+' '+esc(fmt(lang,season+1))+'</label>'+
   '<select id="'+id+'" data-rotation="'+index+'" data-season="'+season+'" aria-label="'+esc(name)+' · '+esc(m.season)+' '+esc(fmt(lang,season+1))+'">'+Object.keys(crops).map(c=>'<option value="'+c+'"'+(c===crop?' selected':'')+'>'+esc(crops[c][lang])+'</option>').join('')+'</select>'+
   '<span class="lane-family">'+esc(known?d.families[crops[crop].botanicalFamily]:m.unavailable)+(repeat?'<em>'+esc(d.repeatsPrev)+'</em>':'')+'</span></li>';
 }).join('');
 const stats='<dl class="lane-stats">'+Object.keys(STAT_LABEL).map(key=>'<div'+(changed.has(key)?' data-changed="true"':'')+'><dt>'+esc(m[STAT_LABEL[key]])+'</dt><dd>'+(facts[key]===null?esc(m.unavailable):esc(fmt(lang,facts[key])))+'</dd></div>').join('')+'</dl>';
 const flagged=evaluation.checks.filter(c=>c.result==='WARNING'||c.result==='FAIL');
 const where=c=>c.id==='family'?' · '+esc(m.season)+' '+esc(fmt(lang,c.season-1))+'–'+esc(fmt(lang,c.season)):c.id==='history'?' · '+esc(d.labels.history):'';
 const warnings=flagged.length?'<ul class="lane-warnings">'+flagged.map(c=>'<li data-status="'+esc(c.result)+'">'+mark(c.result,lang)+'<span>'+esc(d.short[c.reason]??d.labels[c.id])+where(c)+'</span></li>').join('')+'</ul>':'<p class="lane-clear">'+esc(d.noWarnings)+'</p>';
 const open='<p class="lane-open">'+mark('UNKNOWN',lang)+'<span>'+esc(d.unresolvedLabel)+' · <b>'+esc(fmt(lang,facts.unresolved))+'</b></span></p>';
 const note=change?'<p class="lane-change"><strong>'+esc(d.updated)+'</strong> '+(change.items.length?change.items.map(item=>esc(item.key==='warnings'?d.warningsLabel:m[STAT_LABEL[item.key]])+' <bdi>'+esc(item.from===null?m.unavailable:fmt(lang,item.from))+' '+arrow(lang)+' '+esc(item.to===null?m.unavailable:fmt(lang,item.to))+'</bdi>').join(' · '):esc(d.noCountChange))+'</p>':'';
 return '<article class="plan-lane" data-plan="'+plan+'"'+(change?' data-changed="true"':'')+' aria-label="'+esc(name)+'"><header class="lane-id"><span class="lane-letter" aria-hidden="true">'+plan+'</span><h3>'+esc(name)+'</h3></header><ol class="lane-track">'+track+'</ol><div class="lane-notes">'+stats+warnings+open+'<div class="lane-live" aria-live="polite">'+note+'</div></div>'+renderDecisionChecks(evaluation,lang,index)+'</article>';
}
export function renderFamilyLegend(lang){
 const d=messages[lang].decision,seen=new Map();
 for(const crop of Object.values(crops))if(!seen.has(crop.family))seen.set(crop.family,crop.botanicalFamily);
 return '<ul class="family-legend" aria-label="'+esc(messages[lang].families)+'">'+[...seen].map(([family,botanical])=>'<li data-family="'+esc(family)+'"><i aria-hidden="true"></i>'+esc(d.families[botanical])+'</li>').join('')+'</ul>';
}
export function renderDecisionComparison(comparison,lang){
 const m=messages[lang],d=m.decision,evaluations=comparison.evaluations,facts=evaluations.map(planFacts),first=evaluations[0];
 const value=n=>n===null?esc(m.unavailable):esc(fmt(lang,n));
 const rows=[
  [m.families,facts.map(f=>[f.families,f.status.families])],
  [m.repeats,facts.map(f=>[f.repeats,f.status.repeats])],
  [m.legumes,facts.map(f=>[f.legumes,f.status.legumes])],
  [d.labels.history,facts.map(f=>[f.history,f.history??'UNKNOWN',true])],
  [d.warningsLabel,facts.map(f=>[f.warnings,f.warnings?'WARNING':'PASS'])],
  [d.unresolvedLabel,facts.map(f=>[f.unresolved,f.unresolved?'UNKNOWN':'PASS'])]
 ];
 const body=rows.map(([label,cells])=>{
  const differs=new Set(cells.map(([v])=>String(v))).size>1;
  return '<tr data-differs="'+differs+'"><th scope="row">'+esc(label)+'<small>'+esc(differs?d.differs:d.sameAll)+'</small></th>'+cells.map(([v,status,word])=>'<td data-status="'+status+'"'+(word?' class="word"':'')+'>'+mark(status,lang)+'<b>'+(word?esc(v===null?m.unavailable:d[v]):value(v))+'</b></td>').join('')+'</tr>';
 }).join('');
 const head=evaluations.map((_,i)=>'<th scope="col"><span class="lane-letter" aria-hidden="true">'+letter(i)+'</span><span class="sr-only">'+esc(rotationLabel(lang,i))+'</span></th>').join('');
 // Checks the engine leaves UNKNOWN for every plan are stated once instead of repeated per plan.
 const open=[...new Set((first?.checks??[]).filter(c=>c.result==='UNKNOWN'&&evaluations.every(e=>e.checks.find(x=>x.id===c.id&&x.season===c.season)?.result==='UNKNOWN')).map(c=>d.labels[c.id]))];
 const detail='<details class="comparison-evidence" data-k="comparison-detail"><summary>'+esc(d.title)+'</summary><div class="compare-scroll"><table class="compare-detail"><thead><tr><th scope="col">'+esc(d.checks)+'</th>'+evaluations.map((_,i)=>'<th scope="col">'+esc(rotationLabel(lang,i))+'</th>').join('')+'</tr></thead><tbody>'+(first?.checks??[]).map(c=>'<tr><th scope="row">'+esc(d.labels[c.id])+(c.season?' · '+esc(m.season)+' '+esc(fmt(lang,c.season)):'')+'</th>'+evaluations.map(e=>{const match=e.checks.find(x=>x.id===c.id&&x.season===c.season),status=match?.result??'UNKNOWN';return '<td data-status="'+status+'">'+esc(d[status])+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></details>';
 return '<h3>'+esc(d.compareTitle)+'</h3><div class="compare-scroll"><table class="compare"><thead><tr><th scope="col"><span class="sr-only">'+esc(d.checks)+'</span></th>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>'+
  (open.length?'<p class="compare-open">'+mark('UNKNOWN',lang)+'<span><strong>'+esc(d.notAssessed)+':</strong> '+open.map(esc).join(' · ')+'</span></p>':'')+
  '<p class="compare-limits">'+esc(d.insufficientEvidence)+'</p>'+detail;
}
