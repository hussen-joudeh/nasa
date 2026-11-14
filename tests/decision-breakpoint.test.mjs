import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPreflight} from '../src/preflight.mjs';
import {analyzeDecisionSensitivity} from '../src/decision-breakpoint.mjs';

function climate({rain=0,missing=[]}={}){
  const omit=new Set(missing),tmax={},tmin={},precipitation={};
  for(let date=new Date('2025-01-01T00:00:00Z');date<=new Date('2025-12-31T00:00:00Z');date.setUTCDate(date.getUTCDate()+1)){
    const key=date.toISOString().slice(0,10).replaceAll('-','');
    if(omit.has(key))continue;
    tmax[key]=20;tmin[key]=10;precipitation[key]=rain;
  }
  const summary=(values,kind)=>({validDays:Object.keys(values).length,daysInSeries:365,[kind]:kind==='sum'?Object.values(values).reduce((a,b)=>a+b,0):Object.values(values).reduce((a,b)=>a+b,0)/Object.keys(values).length});
  const channel=(code,unit,daily,stat)=>({code,unit,available:true,daily,summary:summary(daily,stat)});
  return {source:'NASA POWER',dataset:'NASA/POWER Daily',coordinates:{latitude:36.78,longitude:-119.95},period:{start:'20250101',end:'20251231',startIso:'2025-01-01',endIso:'2025-12-31'},channels:{temperatureMax:channel('T2M_MAX','C',tmax,'mean'),temperatureMin:channel('T2M_MIN','C',tmin,'mean'),precipitation:channel('PRECTOTCORR','mm/day',precipitation,'sum')}};
}
const rotations=[['maize','maize','maize']];
const context={areaHa:2,waterBudget:null,plantingDates:['2025-02-01','2025-02-01','2025-02-01'],illustrativeCropSettings:true,effectiveRainfallSlopeConfirmed:true};

test('finds the real per-season threshold and demonstrates rule change on either side',()=>{
  const options={testedBudgetRange:{min:0,max:100_000,unit:'m3',period:'perSeason'}};
  const sensitivity=analyzeDecisionSensitivity(rotations,context,climate(),options);
  const baseline=runPreflight(rotations[0],context,climate());
  const finding=sensitivity.findings.find(item=>item.rotationIndex===0&&item.season===1&&item.ruleId==='water.balance');
  assert.ok(finding);
  assert.equal(finding.classification,'DECISION-SENSITIVE');
  assert.equal(finding.baselineStatus,'UNKNOWN');
  assert.equal(finding.threshold.mm,baseline.water.seasons[0].needMm.max);
  assert.equal(finding.statuses.atMin,'FAIL');
  assert.equal(finding.statuses.atThreshold,'PASS');
  assert.equal(finding.threshold.m3,baseline.water.seasons[0].needM3.max);
});

test('same water-rule result across a tested range is labeled stable only for that range',()=>{
  const baseline=runPreflight(rotations[0],context,climate());
  const threshold=baseline.water.seasons[0].needM3.max;
  const result=analyzeDecisionSensitivity(rotations,context,climate(),{testedBudgetRange:{min:0,max:threshold/2,unit:'m3',period:'perSeason'}});
  const finding=result.findings.find(item=>item.season===1&&item.ruleId==='water.balance');
  assert.equal(finding.classification,'STABLE WITHIN TESTED RANGE');
  assert.equal(finding.statuses.atMin,'FAIL');
  assert.equal(finding.statuses.atMax,'FAIL');
  assert.ok(finding.threshold.m3>finding.testedRange.max);
});

test('invalid tested ranges are reported as insufficient instead of silently omitted',()=>{
  const result=analyzeDecisionSensitivity(rotations,context,climate(),{testedBudgetRange:{min:900,max:500,unit:'m3',period:'perSeason'}});
  assert.ok(result.findings.some(item=>item.classification==='INSUFFICIENT EVIDENCE'&&item.missingInformation.includes('validTestedBudgetRange')));
});

test('unsupported or missing evidence stays unassessed and findings are deduplicated',()=>{
  const result=analyzeDecisionSensitivity([['wheat','chickpea','sunflower']],context,null);
  const ids=result.findings.map(item=>item.id);
  assert.ok(result.findings.length>0);
  assert.ok(result.findings.every(item=>item.classification==='INSUFFICIENT EVIDENCE'));
  assert.ok(result.findings.every(item=>item.threshold===null&&item.testedRange===null));
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(result.findings.some(item=>item.ruleId==='water.season-data'));
});

test('reports inclusive lower and upper rule transitions from real Preflight runs',()=>{
  const baseline=runPreflight(rotations[0],context,climate());
  const need=baseline.water.seasons[0].needMm;
  const max=baseline.water.seasons[0].needM3.max;
  const result=analyzeDecisionSensitivity(rotations,context,climate(),{testedBudgetRange:{min:0,max,unit:'m3',period:'perSeason'}});
  const finding=result.findings.find(item=>item.season===1&&item.ruleId==='water.balance');
  assert.deepEqual(finding.transitions.map(item=>[item.atMm,item.statusAt,item.statusBelow]),[[need.min,'WARNING','FAIL'],[need.max,'PASS','WARNING']]);
});

test('exact maximum-need budget is inclusive and returns the actual Preflight status',()=>{
  const baseline=runPreflight(rotations[0],context,climate());
  const threshold=baseline.water.seasons[0].needM3.max;
  const result=analyzeDecisionSensitivity(rotations,context,climate(),{testedBudgetRange:{min:threshold-1,max:threshold+1,unit:'m3',period:'perSeason'}});
  const finding=result.findings.find(item=>item.season===1&&item.ruleId==='water.balance');
  assert.equal(finding.threshold.inclusive,true);
  assert.equal(finding.statuses.atThreshold,'PASS');
  const exact=runPreflight(rotations[0],{...context,waterBudget:{amount:threshold,unit:'m3',period:'perSeason'}},climate());
  assert.equal(exact.checks.find(item=>item.ruleId==='water.balance'&&item.season===1).status,'PASS');
});

test('per-season budgets are evaluated independently for each crop slot',()=>{
  const sequence=['wheat','maize','soy'];
  const baseline=runPreflight(sequence,context,climate());
  const result=analyzeDecisionSensitivity([sequence],context,climate(),{testedBudgetRange:{min:0,max:100_000,unit:'m3',period:'perSeason'}});
  const bySeason=result.findings.filter(item=>item.ruleId==='water.balance');
  assert.equal(bySeason.length,3);
  for(const item of bySeason){
    assert.equal(item.testedRange.period,'perSeason');
    assert.equal(item.threshold.m3,baseline.water.seasons[item.season-1].needM3.max);
  }
  assert.ok(Math.max(...bySeason.map(item=>item.threshold.m3))<baseline.water.budgetComparison.needM3.max);
});

test('whole-plan budget uses the existing summed plan-level rule, not a season budget',()=>{
  const planContext={...context,waterBudget:{amount:0,unit:'m3',period:'wholePlan'}};
  const baseline=runPreflight(['maize','wheat','soy'],planContext,climate());
  const result=analyzeDecisionSensitivity([['maize','wheat','soy']],planContext,climate(),{testedBudgetRange:{min:0,max:100_000,unit:'m3',period:'wholePlan'}});
  const findings=result.findings.filter(item=>item.ruleId==='water.plan-balance');
  assert.equal(findings.length,1);
  assert.equal(findings[0].threshold.m3,baseline.water.budgetComparison.needM3.max);
  assert.equal(findings[0].testedRange.period,'wholePlan');
});

test('budget updates report only actual changed rule outcomes and preserve UNKNOWN plan status',()=>{
  const before=analyzeDecisionSensitivity(rotations,context,climate());
  const threshold=before.evaluations[0].water.seasons[0].needM3.max;
  const after=analyzeDecisionSensitivity(rotations,{...context,waterBudget:{amount:threshold,unit:'m3',period:'perSeason'}},climate(),{previousEvaluations:before.evaluations,previousInputs:{...context,rotations}});
  const change=after.observedChanges.changed.find(item=>item.ruleId==='water.balance'&&item.season===1);
  assert.deepEqual([change.before,change.after],['UNKNOWN','PASS']);
  assert.deepEqual(after.observedChanges.changedInputs,['waterBudget']);
  assert.ok(after.observedChanges.changed.every(item=>['water.balance','water.budget'].includes(item.ruleId)));
  assert.ok(after.observedChanges.unchangedCount>0);
  assert.notEqual(after.evaluations[0].status,'PASS');
});

test('the three existing rotation strategies stay analyzable with unsupported crops unassessed',async()=>{
  const {defaultRotations}=await import('../src/domain.mjs');
  const result=analyzeDecisionSensitivity(defaultRotations,context,climate());
  assert.equal(result.evaluations.length,3);
  assert.ok(result.findings.some(item=>item.rotationIndex===2&&item.ruleId==='water.season-data'&&item.classification==='INSUFFICIENT EVIDENCE'));
  assert.ok(result.findings.some(item=>item.rotationIndex===0&&item.ruleId==='water.balance'&&item.classification==='DECISION-SENSITIVE'));
});
