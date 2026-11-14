import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runPreflight} from '../src/preflight.mjs';
import {areaHa} from '../src/domain.mjs';

const polygon=[[0,0],[0.01,0],[0.01,0.01],[0,0.01]];
const fieldContext={
  polygon,
  previousCrop:null,
  waterBudget:null,
  plantingDates:['2025-02-01','2025-02-01','2025-02-01'],
  illustrativeCropSettings:true,
  effectiveRainfallSlopeConfirmed:true,
};
const climateData=null;
const requiredFields=['ruleId','status','explanation','season','evidence','inputs','missingInformation','nextStep'];

test('Preflight preserves rotation warnings and adds sourced UNKNOWN water checks',()=>{
  const result=runPreflight(['wheat','maize','wheat'],fieldContext,climateData);
  assert.equal(result.rotation.sequence.length,3);
  assert.ok(result.checks.some(check=>check.ruleId==='rotation.family'&&check.status==='WARNING'));
  assert.ok(result.checks.some(check=>check.ruleId==='water.budget'&&check.status==='UNKNOWN'));
  assert.equal(result.status,'UNKNOWN');
  for(const check of result.checks){
    for(const key of requiredFields)assert.ok(Object.hasOwn(check,key),`${check.ruleId} lacks ${key}`);
    assert.ok(check.explanation);
    assert.ok(check.evidence);
    assert.ok(check.nextStep);
    assert.ok(Array.isArray(check.missingInformation));
  }
});

test('missing water inputs never yield overall PASS and statuses remain enumerable',()=>{
  const result=runPreflight(['wheat','soy','sunflower'],fieldContext,null);
  assert.notEqual(result.status,'PASS');
  assert.ok(result.statuses.UNKNOWN>0);
  assert.ok(result.checks.some(check=>check.status==='UNKNOWN'));
});

test('BioFirewall checks are integrated separately and do not alter Water Truth calculations',()=>{
  const rotation=['wheat','maize','wheat'];
  const baseline=runPreflight(rotation,fieldContext,climateData);
  const biofirewall={fieldId:'Field-B',reportedHazard:{fieldId:'Field-A',hazardId:'clubroot',hazardName:'',evidenceStatus:'confirmed',recordedDate:'2025-04-01',notes:''},equipmentMovements:[{id:'move-1',equipmentId:'tractor-1',fromFieldId:'Field-A',toFieldId:'Field-B',sourceUseConfirmed:true,movedAt:'2025-04-02',cleaningStatus:'not-recorded',cleaningDate:'',notes:''}]};
  const result=runPreflight(rotation,{...fieldContext,biofirewall},climateData);
  assert.equal(result.checks.find(check=>check.ruleId==='biofirewall.equipment-exposure').status,'WARNING');
  assert.equal(result.checks.find(check=>check.ruleId==='biofirewall.equipment-exposure').evidenceStatus,'potential-exposure');
  assert.deepEqual(result.water,baseline.water);
  assert.deepEqual(result.checks.filter(check=>!check.ruleId.startsWith('biofirewall.')),baseline.checks.filter(check=>!check.ruleId.startsWith('biofirewall.')));
  for(const check of result.checks.filter(item=>item.ruleId.startsWith('biofirewall.'))){
    for(const key of requiredFields)assert.ok(Object.hasOwn(check,key),`${check.ruleId} lacks ${key}`);
    assert.ok(check.fieldId);
    assert.ok(check.reason);
  }
});

test('missing BioFirewall records remain UNKNOWN and never mean disease-free',()=>{
  const result=runPreflight(['wheat','soy','sunflower'],{...fieldContext,biofirewall:{fieldId:'Field-B',reportedHazard:{fieldId:'Field-B',hazardId:'clubroot',hazardName:'',evidenceStatus:'no-reported-infection',recordedDate:'',notes:''},equipmentMovements:[]}},null);
  const history=result.checks.find(check=>check.ruleId==='biofirewall.reported-hazard');
  const exposure=result.checks.find(check=>check.ruleId==='biofirewall.equipment-exposure');
  assert.equal(history.status,'UNKNOWN');
  assert.equal(history.evidenceStatus,'no-reported-infection-history');
  assert.equal(exposure.status,'UNKNOWN');
  assert.match(history.explanation,/does not establish.*disease-free/i);
});


test('field area is derived from the existing validated polygon when needed',()=>{
  const result=runPreflight(['maize','maize','maize'],{...fieldContext,waterBudget:{amount:0,unit:'mm',period:'perSeason'}},null);
  assert.ok(Math.abs(result.field.areaHa-areaHa(polygon))<1e-9);
});
