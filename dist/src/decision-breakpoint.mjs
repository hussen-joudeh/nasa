import {runPreflight} from './preflight.mjs';
import {cubicMetresToMillimetres,millimetresToCubicMetres} from './water-truth.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const RULE='water.balance';
function defaultRange(context,period,unit,need){
  const threshold=unit==='m3'?need.m3.max:need.mm.max;
  const budget=context.waterBudget;
  const current=budget&&budget.period===period&&budget.unit===unit?Number(budget.amount):0;
  return {min:0,max:Math.max(threshold,finite(current)?current:0),unit,period,derived:true};
}
function normalizeRange(options,context,need){
  const provided=options?.testedBudgetRange;
  const period=provided?.period??context.waterBudget?.period??options?.period??'perSeason';
  const unit=provided?.unit??context.waterBudget?.unit??options?.unit??'m3';
  if(!['perSeason','wholePlan'].includes(period)||!['mm','m3'].includes(unit))return null;
  if(!provided)return defaultRange(context,period,unit,need);
  const min=typeof provided.min==='string'&&provided.min.trim()?Number(provided.min):provided.min;
  const max=typeof provided.max==='string'&&provided.max.trim()?Number(provided.max):provided.max;
  if(!finite(min)||!finite(max)||min<0||max<min)return null;
  return {min,max,unit,period,derived:false};
}
function amountFor(mm,m3,unit){return unit==='m3'?m3:mm;}
function needFor(evaluation,period,season){
  if(period==='wholePlan')return {mm:evaluation.water.budgetComparison.needMm,m3:evaluation.water.budgetComparison.needM3,ruleId:'water.plan-balance',season:null};
  const row=evaluation.water.seasons.find(item=>item.season===season);
  return row?{mm:row.needMm,m3:row.needM3,ruleId:RULE,season}:null;
}
function statusFor(evaluation,ruleId,season){
  return evaluation.checks.find(check=>check.ruleId===ruleId&&check.season===season)?.status??'UNKNOWN';
}
function amountToMm(amount,range,areaHa){return range.unit==='m3'?cubicMetresToMillimetres(amount,areaHa):amount;}
function rerun(rotation,context,climate,range,amount,areaHa){
  return runPreflight(rotation,{...context,waterBudget:{amount:amountToMm(amount,range,areaHa),unit:'mm',period:range.period}},climate);
}
function outcomeAt(rotation,context,climate,range,amount,ruleId,season,areaHa){
  const evaluation=rerun(rotation,context,climate,range,amount,areaHa);
  return {amount,status:statusFor(evaluation,ruleId,season)};
}
function changedInputKeys(previous,current){
  if(!previous||typeof previous!=='object')return [];
  const keys=['waterBudget','plantingDates','illustrativeCropSettings','effectiveRainfallSlopeConfirmed','previousCrop','rotations'];
  return keys.filter(key=>JSON.stringify(previous[key]??null)!==JSON.stringify(current[key]??null));
}
function observedChanges(previous,current,previousInputs,currentInputs){
  if(!Array.isArray(previous))return null;
  const changed=[],unchanged=[];
  current.forEach((evaluation,index)=>{
    const old=previous[index];if(!old)return;
    const keys=new Set([...old.checks,...evaluation.checks].map(check=>`${check.ruleId}:${check.season??'plan'}`));
    for(const key of keys){
      const [ruleId,seasonKey]=key.split(':');
      const season=seasonKey==='plan'?null:Number(seasonKey);
      const before=old.checks.find(check=>check.ruleId===ruleId&&check.season===season)?.status??'UNKNOWN';
      const after=evaluation.checks.find(check=>check.ruleId===ruleId&&check.season===season)?.status??'UNKNOWN';
      const item={rotationIndex:index,ruleId,season,before,after};
      (before===after?unchanged:changed).push(item);
    }
  });
  return {changed,unchangedCount:unchanged.length,changedInputs:changedInputKeys(previousInputs,currentInputs)};
}

function currentInputSnapshot(rotations,context){
  return {
    waterBudget:context.waterBudget??null,
    plantingDates:Array.isArray(context.plantingDates)?[...context.plantingDates]:null,
    illustrativeCropSettings:context.illustrativeCropSettings===true,
    effectiveRainfallSlopeConfirmed:context.effectiveRainfallSlopeConfirmed===true,
    previousCrop:context.previousCrop??null,
    rotations:rotations.map(sequence=>Array.isArray(sequence)?[...sequence]:sequence),
  };
}

/**
 * Probe supported field-applied irrigation-budget uncertainty by re-running
 * the existing Preflight rules at the tested values and model-derived edges.
 * This reports rule changes only; it never grades the complete plan as safe.
 */
export function analyzeDecisionSensitivity(rotations,fieldContext={},climateData=null,options={}){
  const sequences=Array.isArray(rotations)?rotations:[];
  const evaluations=sequences.map(rotation=>runPreflight(rotation,fieldContext,climateData));
  const findings=[];
  evaluations.forEach((evaluation,rotationIndex)=>{
    const period=options.testedBudgetRange?.period??fieldContext.waterBudget?.period??options.period??'perSeason';
    const seasons=period==='wholePlan'?[null]:[1,2,3];
    for(const season of seasons){
      const need=needFor(evaluation,period,season);
      const ready=need&&need.mm&&need.m3&&finite(need.mm.max)&&finite(need.m3.max)&&evaluation.field.areaHa>0;
      if(ready){
        const range=normalizeRange(options,fieldContext,need);
        if(!range){
          findings.push({id:`range:${rotationIndex}:${need.season??'plan'}`,rotationIndex,ruleId:need.ruleId,season:need.season,variable:'waterBudget',classification:'INSUFFICIENT EVIDENCE',testedRange:null,threshold:null,statuses:null,transitions:[],explanation:'The tested water-budget range or units are invalid, so no sensitivity conclusion can be supported.',missingInformation:['validTestedBudgetRange'],verifyAction:'Provide non-negative minimum and maximum values in the same supported unit and period.'});
          continue;
        }
        const threshold={mm:need.mm.max,m3:need.m3.max,inclusive:true};
        const edgeAmount=amountFor(need.mm.max,need.m3.max,range.unit);
        const areaHa=evaluation.field.areaHa;
        const minMm=amountToMm(range.min,range,areaHa),maxMm=amountToMm(range.max,range,areaHa);
        const candidates=[
          outcomeAt(sequences[rotationIndex],fieldContext,climateData,range,range.min,need.ruleId,need.season,areaHa),
          outcomeAt(sequences[rotationIndex],fieldContext,climateData,range,range.max,need.ruleId,need.season,areaHa),
          ...(edgeAmount>=range.min&&edgeAmount<=range.max?[outcomeAt(sequences[rotationIndex],fieldContext,climateData,range,edgeAmount,need.ruleId,need.season,areaHa)]:[]),
        ];
        const statuses=Object.fromEntries(candidates.map((item,index)=>[index===0?'atMin':index===1?'atMax':'atThreshold',item.status]));
        const transitions=[...new Set([need.mm.min,need.mm.max])].filter(boundary=>boundary>minMm&&boundary<=maxMm).map(boundary=>{
          const belowMm=Math.max(minMm,boundary-Math.max(1e-9,Math.abs(boundary)*Number.EPSILON*8));
          const atAmount=amountFor(boundary,millimetresToCubicMetres(boundary,areaHa),range.unit);
          const belowAmount=amountFor(belowMm,millimetresToCubicMetres(belowMm,areaHa),range.unit);
          const at=outcomeAt(sequences[rotationIndex],fieldContext,climateData,range,atAmount,need.ruleId,need.season,areaHa).status;
          const below=outcomeAt(sequences[rotationIndex],fieldContext,climateData,range,belowAmount,need.ruleId,need.season,areaHa).status;
          return {atMm:boundary,atM3:millimetresToCubicMetres(boundary,areaHa),statusAt:at,statusBelow:below};
        });
        const observed=new Set([...Object.values(statuses),...transitions.flatMap(item=>[item.statusAt,item.statusBelow])]);
        findings.push({
          id:`water:${rotationIndex}:${need.season??'plan'}`,rotationIndex,ruleId:need.ruleId,season:need.season,
          variable:'waterBudget',baselineStatus:statusFor(evaluation,need.ruleId,need.season),classification:observed.size>1?'DECISION-SENSITIVE':'STABLE WITHIN TESTED RANGE',
          testedRange:range,threshold,statuses,transitions,
          explanation:observed.size>1?'The existing Preflight water rule changes within this tested budget range. This is a rule-level change, not approval of the complete agricultural plan.':'The existing Preflight water rule did not change within this tested budget range.',
          missingInformation:[],verifyAction:'Confirm field-applied irrigation availability for the same unit and period, then rerun Preflight.',
        });
        continue;
      }
      const unsupported=evaluation.checks.filter(check=>check.status==='UNKNOWN'&&check.missingInformation?.length&&!['water.balance','water.plan-balance'].includes(check.ruleId));
      for(const check of unsupported){
        findings.push({id:`missing:${rotationIndex}:${check.ruleId}:${check.season??'plan'}`,rotationIndex,ruleId:check.ruleId,season:check.season,reason:check.evidence?.reason??null,variable:null,classification:'INSUFFICIENT EVIDENCE',testedRange:null,threshold:null,statuses:null,explanation:'The existing rules cannot establish sensitivity for this missing or unsupported input; no outcome is inferred.',missingInformation:[...check.missingInformation],verifyAction:check.nextStep});
      }
    }
  });
  const rank={'DECISION-SENSITIVE':0,'STABLE WITHIN TESTED RANGE':1,'INSUFFICIENT EVIDENCE':2};
  const uniqueFindings=[...new Map(findings.map(item=>[item.id,item])).values()];
  uniqueFindings.sort((a,b)=>rank[a.classification]-rank[b.classification]||a.rotationIndex-b.rotationIndex||(a.season??0)-(b.season??0));
  const currentInputs=currentInputSnapshot(sequences,fieldContext);
  return {evaluations,findings:uniqueFindings,observedChanges:observedChanges(options.previousEvaluations,evaluations,options.previousInputs,currentInputs)};
}
