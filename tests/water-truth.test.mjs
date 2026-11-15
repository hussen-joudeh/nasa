import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  hargreavesSamaniETo,
  millimetresToCubicMetres,
  cubicMetresToMillimetres,
  estimateWaterTruth,
} from '../src/water-truth.mjs';

const datesIn2025=()=>{
  const result=[];
  const date=new Date('2025-01-01T00:00:00Z');
  while(date.getUTCFullYear()===2025){
    result.push(date.toISOString().slice(0,10).replaceAll('-',''));
    date.setUTCDate(date.getUTCDate()+1);
  }
  return result;
};
function power({rain=0,missing=[]}={}){
  const omitted=new Set(missing);
  const daily=datesIn2025().filter(day=>!omitted.has(day));
  const channel=(code,unit,values)=>({code,unit,available:true,daily:Object.fromEntries(daily.map(day=>[day,values(day)]))});
  return {
    source:'NASA POWER',dataset:'NASA/POWER Daily',timeStandard:'LST',
    coordinates:{latitude:36.78,longitude:-119.95},
    period:{start:'20250101',end:'20251231',startIso:'2025-01-01',endIso:'2025-12-31'},
    channels:{
      precipitation:channel('PRECTOTCORR','mm/day',()=>rain),
      temperatureMax:channel('T2M_MAX','C',()=>20),
      temperatureMin:channel('T2M_MIN','C',()=>10),
    },
  };
}
const context=(overrides={})=>({
  areaHa:2,
  waterBudget:{amount:1_000_000,unit:'m3',period:'perSeason'},
  plantingDates:['2025-02-01','2025-02-01','2025-02-01'],
  illustrativeCropSettings:true,
  effectiveRainfallSlopeConfirmed:true,
  ...overrides,
});

test('FAO-56 Hargreaves-Samani uses extraterrestrial radiation in mm/day',()=>{
  const eto=hargreavesSamaniETo({tmaxC:20,tminC:10,latitude:36.78,date:'2025-02-01'});
  assert.ok(Math.abs(eto-1.8936935204834957)<1e-9);
});

test('water depth and field volume conversions use hectares and cubic metres',()=>{
  assert.equal(millimetresToCubicMetres(1,1),10);
  assert.equal(millimetresToCubicMetres(125,2),2500);
  assert.equal(cubicMetresToMillimetres(2500,2),125);
});

test('complete maize scenario compares a per-season budget and converts need to field volume',()=>{
  const result=estimateWaterTruth(['maize','maize','maize'],context(),power());
  assert.equal(result.status,'WARNING');
  assert.equal(result.budgetComparison.status,'PASS');
  assert.equal(result.scenarioLabel,'historical-climate-analogue');
  assert.equal(result.period.startIso,'2025-01-01');
  assert.equal(result.seasons.length,3);
  const season=result.seasons[0];
  assert.equal(season.budgetStatus,'PASS');
  assert.ok(season.needMm.min>0);
  assert.ok(season.needMm.max>=season.needMm.min);
  assert.ok(Math.abs(season.needM3.min-season.needMm.min*20)<1e-8);
  assert.equal(season.budget.period,'perSeason');
});

test('a confirmed budget deficit is reported instead of hidden by the estimate',()=>{
  const result=estimateWaterTruth(['maize','maize','maize'],context({waterBudget:{amount:0,unit:'m3',period:'perSeason'}}),power());
  assert.equal(result.status,'FAIL');
  assert.equal(result.seasons[0].status,'FAIL');
  assert.ok(result.seasons[0].deficitM3.max>0);
});

test('missing water budget or climate observations produces UNKNOWN, never PASS',()=>{
  const blankBudget=estimateWaterTruth(['maize','maize','maize'],context({waterBudget:{amount:'',unit:'mm',period:'perSeason'}}),power());
  const balance=blankBudget.checks.find(check=>check.ruleId==='water.balance'&&check.season===1);
  assert.equal(balance.status,'UNKNOWN');
  assert.ok(balance.missingInformation.includes('availableIrrigationBudget'));
  assert.ok(!balance.missingInformation.includes('planLevelBudget'));
  assert.match(balance.explanation,/missing/i);
  const noBudget=estimateWaterTruth(['maize','maize','maize'],context({waterBudget:null}),power());
  assert.equal(noBudget.status,'UNKNOWN');
  const missingDay=estimateWaterTruth(['maize','maize','maize'],context(),power({missing:['20250201']}));
  assert.equal(missingDay.status,'UNKNOWN');
  assert.equal(missingDay.seasons[0].status,'UNKNOWN');
  assert.ok(missingDay.seasons[0].missingInformation.includes('dailyClimateObservation'));
});

test('unsupported crop calendar returns UNKNOWN and identifies the crop',()=>{
  const result=estimateWaterTruth(['wheat','chickpea','sunflower'],context(),power());
  assert.equal(result.seasons[1].status,'UNKNOWN');
  assert.ok(result.seasons[1].missingInformation.includes('cropGrowthStageCalendar'));
  assert.equal(result.status,'UNKNOWN');
});

test('NASA precipitation changes the modeled irrigation requirement through effective rainfall',()=>{
  const dry=estimateWaterTruth(['maize','maize','maize'],context(),power({rain:0}));
  const wet=estimateWaterTruth(['maize','maize','maize'],context(),power({rain:4}));
  assert.ok(wet.seasons[0].needMm.max<dry.seasons[0].needMm.max);
  assert.ok(wet.seasons[0].effectivePrecipitationMm>dry.seasons[0].effectivePrecipitationMm);
});

test('missing explicit illustrative settings or effective-rainfall applicability remains UNKNOWN',()=>{
  const noTemplate=estimateWaterTruth(['maize','maize','maize'],context({illustrativeCropSettings:false}),power());
  assert.equal(noTemplate.status,'UNKNOWN');
  const noSlope=estimateWaterTruth(['maize','maize','maize'],context({effectiveRainfallSlopeConfirmed:false}),power());
  assert.equal(noSlope.status,'UNKNOWN');
});

test('whole-plan budget is compared with the sum of all three season requirements',()=>{
  const result=estimateWaterTruth(['maize','maize','maize'],context({waterBudget:{amount:1_000_000,unit:'m3',period:'wholePlan'}}),power());
  const total=result.seasons.reduce((sum,item)=>sum+item.needM3.max,0);
  assert.equal(result.budgetComparison.period,'wholePlan');
  assert.ok(Math.abs(result.budgetComparison.needM3.max-total)<1e-8);
});
