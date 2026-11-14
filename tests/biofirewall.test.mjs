import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBioFirewall} from '../src/biofirewall.mjs';

const base={
  fieldId:'Field-B',
  reportedHazard:{fieldId:'Field-A',hazardId:'clubroot',evidenceStatus:'confirmed',recordedDate:'2025-04-01',notes:'Illustrative farmer-reported record.'},
  equipmentMovements:[{id:'move-1',equipmentId:'tractor-1',fromFieldId:'Field-A',toFieldId:'Field-B',sourceUseConfirmed:true,movedAt:'2025-04-02',cleaningStatus:'not-recorded',cleaningDate:'',notes:''}],
};
const check=(data,ruleId='biofirewall.equipment-exposure')=>evaluateBioFirewall(data).find(item=>item.ruleId===ruleId);

test('confirmed reported hazard plus supported source-to-target equipment movement flags potential exposure',()=>{
  const result=check(base);
  assert.equal(result.status,'WARNING');
  assert.equal(result.evidenceStatus,'potential-exposure');
  assert.equal(result.fieldId,'Field-B');
  assert.equal(result.sourceFieldId,'Field-A');
  assert.equal(result.equipmentId,'tractor-1');
  assert.equal(result.reportedEvidenceStatus,'confirmed');
  assert.ok(result.missingInformation.includes('equipmentCleaningRecord'));
  assert.ok(result.sources.some(source=>source.url.includes('gov.mb.ca')));
  const history=check(base,'biofirewall.reported-hazard');
  assert.equal(history.fieldId,'Field-A');
  assert.equal(history.status,'WARNING');
});

test('suspected hazard can support only a potential-exposure warning and preserves suspected evidence',()=>{
  const result=check({...base,reportedHazard:{...base.reportedHazard,evidenceStatus:'suspected'}});
  assert.equal(result.status,'WARNING');
  assert.equal(result.evidenceStatus,'potential-exposure');
  assert.equal(result.reportedEvidenceStatus,'suspected');
  assert.match(result.explanation,/suspected/i);
});

test('unknown or no-reported-infection history never becomes a disease-free PASS or exposure warning',()=>{
  for(const evidenceStatus of ['unknown','no-reported-infection']){
    const result=check({...base,reportedHazard:{...base.reportedHazard,evidenceStatus}});
    assert.equal(result.status,'UNKNOWN');
    assert.equal(result.evidenceStatus,evidenceStatus==='unknown'?'unknown':'no-reported-infection-history');
    assert.match(result.explanation,/not establish|not mean|not prove|not proof/i);
  }
});

test('incomplete movement or missing source-use evidence remains UNKNOWN',()=>{
  const missingRoute=check({...base,equipmentMovements:[{...base.equipmentMovements[0],toFieldId:''}]});
  assert.equal(missingRoute.status,'UNKNOWN');
  assert.ok(missingRoute.missingInformation.includes('movementDestination'));
  const missingUse=check({...base,equipmentMovements:[{...base.equipmentMovements[0],sourceUseConfirmed:null}]});
  assert.equal(missingUse.status,'UNKNOWN');
  assert.ok(missingUse.missingInformation.includes('sourceEquipmentUse'));
  const missingDate=check({...base,equipmentMovements:[{...base.equipmentMovements[0],movedAt:''}]});
  assert.equal(missingDate.status,'UNKNOWN');
  assert.ok(missingDate.missingInformation.includes('movementDate'));
  const unknownCleaning=check({...base,equipmentMovements:[{...base.equipmentMovements[0],cleaningStatus:'unknown'}]});
  assert.equal(unknownCleaning.status,'UNKNOWN');
  assert.ok(unknownCleaning.missingInformation.includes('equipmentCleaningStatus'));
});

test('recorded cleaning without a validated protocol does not clear potential exposure',()=>{
  const result=check({...base,equipmentMovements:[{...base.equipmentMovements[0],cleaningStatus:'documented-unvalidated',cleaningDate:'2025-04-02'}]});
  assert.equal(result.status,'WARNING');
  assert.equal(result.evidenceStatus,'potential-exposure');
  assert.ok(result.missingInformation.includes('validatedCleaningProtocol'));
  assert.match(result.explanation,/does not verify|cannot clear/i);
});

test('explicitly no equipment use at the source passes only that movement-path check',()=>{
  const result=check({...base,equipmentMovements:[{...base.equipmentMovements[0],sourceUseConfirmed:false}]});
  assert.equal(result.status,'PASS');
  assert.equal(result.evidenceStatus,'no-supported-equipment-path');
  assert.match(result.explanation,/does not establish.*disease-free/i);
});

test('unsupported hazard or absent movement history is UNKNOWN and never invents a biological rule',()=>{
  const unsupported=check({...base,reportedHazard:{...base.reportedHazard,hazardId:'other',hazardName:'Unknown pest'}});
  assert.equal(unsupported.status,'UNKNOWN');
  assert.ok(unsupported.missingInformation.includes('supportedHazardRule'));
  const absent=check({...base,equipmentMovements:[]});
  assert.equal(absent.status,'UNKNOWN');
  assert.ok(absent.missingInformation.includes('equipmentMovementRecord'));
});
