import {messages} from './i18n.mjs';
import {crops} from './domain.mjs';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cropName=(id,lang)=>Object.hasOwn(crops,id)?crops[id][lang]:messages[lang].unavailable;
const rotationLabel=(lang,index)=>index===0?messages[lang].rotationA:index===1?messages[lang].rotationB:`${messages[lang].rotationLabelPrefix} ${String.fromCharCode(65+index)}`;
function evidence(check,lang){
 const m=messages[lang],d=m.decision,i=check.inputs;
 const sequence=i.sequence??(i.crop?[...(i.previousCrop?[i.previousCrop]:[]),i.crop]:i.legumes);
 let html=sequence?'<p>'+sequence.map(id=>esc(cropName(id,lang))).join(' â†’ ')+'</p>':'';
 if(i.families)html+='<p>'+i.families.map(f=>esc(d.families[f])).join(' Â· ')+'</p>';
 if(i.observations){
  html+='<p>'+esc(m.nasaPeriod)+': '+esc(i.period?.startIso??m.unavailable)+' â€” '+esc(i.period?.endIso??m.unavailable)+'</p>';
  html+='<p>'+esc(m.nasaResolution)+' Â· '+esc(m.nasaHistorical)+'</p>';
  html+='<ul>'+Object.entries(i.observations).map(([key,o])=>'<li>'+esc({precipitation:d.periodTotal,temperatureMax:m.nasaTempMax,temperatureMin:m.nasaTempMin}[key])+': '+esc(o.value===null?m.unavailable:new Intl.NumberFormat(lang,{maximumFractionDigits:2}).format(o.value)+' '+o.unit)+'; '+esc(d.validDays)+': '+esc(o.validDays)+'</li>').join('')+'</ul>';
 }
 return html;
}
export function renderDecisionChecks(evaluation,lang){
 const m=messages[lang],d=m.decision;
 return '<details class="plan-evidence"><summary>'+esc(d.checks)+' · '+evaluation.checks.filter(c=>c.result==='WARNING').length+' '+esc(d.WARNING)+' · '+evaluation.checks.filter(c=>c.result==='UNKNOWN').length+' '+esc(d.UNKNOWN)+'</summary>'+evaluation.checks.map(c=>'<details><summary>'+esc(d.labels[c.id])+' Â· '+esc(c.season?m.season+' '+c.season:d.wholePlan)+' Â· <strong>'+esc(d[c.result])+'</strong></summary><p>'+esc(d.reasons[c.reason])+'</p>'+evidence(c,lang)+(c.missing.length?'<p>'+esc(d.missingLabel)+': '+c.missing.map(k=>esc(d.missing[k])).join('Ø› ')+'</p>':'')+'<p>'+esc(d.evidence)+': '+(c.source.startsWith('https://')?'<a href="'+esc(c.source)+'" target="_blank" rel="noreferrer">'+esc(new URL(c.source).hostname)+'</a>':esc(d.contract))+'</p></details>').join('')+'</details>';
}
export function renderDecisionComparison(comparison,lang){
 const m=messages[lang],d=m.decision;
 const first=comparison.evaluations[0];
 return '<h3>'+esc(d.title)+'</h3><p>'+esc(d.insufficientEvidence)+'</p><div class="decision-summaries">'+comparison.evaluations.map((e,i)=>'<article><h4>'+esc(rotationLabel(lang,i))+'</h4><div class="status-counts">'+['FAIL','WARNING','UNKNOWN','PASS'].map(status=>'<span class="preflight-status" data-status="'+status+'">'+e.checks.filter(c=>c.result===status).length+' '+esc(d[status])+'</span>').join('')+'</div></article>').join('')+'</div><details class="comparison-evidence"><summary>'+esc(d.checks)+'</summary><div style="overflow-x:auto"><table><thead><tr><th scope="col">'+esc(d.checks)+'</th>'+comparison.evaluations.map((_,i)=>'<th scope="col">'+esc(rotationLabel(lang,i))+'</th>').join('')+'</tr></thead><tbody>'+(first?.checks??[]).map(c=>'<tr><th scope="row">'+esc(d.labels[c.id])+(c.season?' Â· '+esc(m.season)+' '+c.season:'')+'</th>'+comparison.evaluations.map(e=>{const match=e.checks.find(x=>x.id===c.id&&x.season===c.season);return '<td>'+esc(d[match?.result??'UNKNOWN'])+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></details>';
}
