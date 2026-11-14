export const BIO_HAZARDS={
  clubroot:{
    id:'clubroot',
    label:'Clubroot (Plasmodiophora brassicae)',
    source:{title:'Manitoba Agriculture — Clubroot of Canola: The Facts',url:'https://gov.mb.ca/agriculture/crops/plant-diseases/clubroot-of-canola.html'},
  },
};

const HAZARD_STATES=new Set(['confirmed','suspected','no-reported-infection','unknown']);
const CLEANING_STATES=new Set(['not-recorded','documented-unvalidated','unknown']);
const MAX_TEXT=500;
const text=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const validDate=value=>{
  if(value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const obj=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

export function emptyBioFirewall(){return {fieldId:'',reportedHazard:null,equipmentMovements:[]};}

export function normalizeBioFirewall(value){
  const input=obj(value)?value:{};
  const hazard=obj(input.reportedHazard)?input.reportedHazard:null;
  const movements=Array.isArray(input.equipmentMovements)?input.equipmentMovements.slice(-100):[];
  return {
    fieldId:text(input.fieldId,80),
    reportedHazard:hazard?{
      fieldId:text(hazard.fieldId,80),hazardId:['clubroot','other'].includes(hazard.hazardId)?hazard.hazardId:'other',
      hazardName:text(hazard.hazardName),evidenceStatus:HAZARD_STATES.has(hazard.evidenceStatus)?hazard.evidenceStatus:'unknown',
      recordedDate:validDate(hazard.recordedDate)?hazard.recordedDate:'',notes:text(hazard.notes,MAX_TEXT),
    }:null,
    equipmentMovements:movements.filter(obj).map((movement,index)=>({
      id:text(movement.id,80)||`movement-${index+1}`,equipmentId:text(movement.equipmentId,80),
      fromFieldId:text(movement.fromFieldId,80),toFieldId:text(movement.toFieldId,80),
      sourceUseConfirmed:movement.sourceUseConfirmed===true?true:movement.sourceUseConfirmed===false?false:null,
      movedAt:validDate(movement.movedAt)?movement.movedAt:'',
      cleaningStatus:CLEANING_STATES.has(movement.cleaningStatus)?movement.cleaningStatus:'unknown',
      cleaningDate:validDate(movement.cleaningDate)?movement.cleaningDate:'',notes:text(movement.notes,MAX_TEXT),
    })),
  };
}

export function validateBioFirewall(value){
  if(!obj(value)||typeof value.fieldId!=='string'||value.fieldId.length>80)throw Error('biofirewall');
  if(value.reportedHazard!==undefined&&value.reportedHazard!==null){
    const hazard=value.reportedHazard;
    if(!obj(hazard)||typeof hazard.fieldId!=='string'||hazard.fieldId.length>80||!['clubroot','other'].includes(hazard.hazardId)||typeof hazard.hazardName!=='string'||hazard.hazardName.length>120||!HAZARD_STATES.has(hazard.evidenceStatus)||typeof hazard.recordedDate!=='string'||!validDate(hazard.recordedDate)||typeof hazard.notes!=='string'||hazard.notes.length>MAX_TEXT)throw Error('biofirewall-hazard');
  }
  if(!Array.isArray(value.equipmentMovements)||value.equipmentMovements.length>100)throw Error('biofirewall-movements');
  for(const movement of value.equipmentMovements){
    if(!obj(movement)||typeof movement.id!=='string'||movement.id.length>80||typeof movement.equipmentId!=='string'||movement.equipmentId.length>80||typeof movement.fromFieldId!=='string'||movement.fromFieldId.length>80||typeof movement.toFieldId!=='string'||movement.toFieldId.length>80||![true,false,null].includes(movement.sourceUseConfirmed)||typeof movement.movedAt!=='string'||!validDate(movement.movedAt)||!CLEANING_STATES.has(movement.cleaningStatus)||typeof movement.cleaningDate!=='string'||!validDate(movement.cleaningDate)||typeof movement.notes!=='string'||movement.notes.length>MAX_TEXT)throw Error('biofirewall-movement');
  }
  return true;
}

function finding(ruleId,status,evidenceStatus,fieldId,reason,missingInformation,nextStep,{hazard=null,movement=null,sourceFieldId=null,equipmentId=null,sources=[]}={}){
  const linkedSources=sources.length?sources:(BIO_HAZARDS[hazard?.hazardId]?.source?[BIO_HAZARDS[hazard.hazardId].source]:[]);
  return {
    ruleId,status,evidenceStatus,fieldId,sourceFieldId,equipmentId,season:null,reason,explanation:reason,
    missingInformation,nextStep,hazardId:hazard?.hazardId??null,reportedEvidenceStatus:hazard?.evidenceStatus??null,
    cleaningStatus:movement?.cleaningStatus??null,movementId:movement?.id??null,
    evidence:{source:'Farmer-entered field memory and equipment movement record',hazardRecord:hazard?{fieldId:hazard.fieldId,hazardId:hazard.hazardId,evidenceStatus:hazard.evidenceStatus,recordedDate:hazard.recordedDate}:null,movement:movement?{equipmentId:movement.equipmentId,fromFieldId:movement.fromFieldId,toFieldId:movement.toFieldId,movedAt:movement.movedAt,sourceUseConfirmed:movement.sourceUseConfirmed,cleaningStatus:movement.cleaningStatus,cleaningDate:movement.cleaningDate}:null,sources:linkedSources},
    inputs:{fieldId,sourceFieldId,equipmentId},sources:linkedSources,
  };
}

function historyCheck(state){
  const hazard=state.reportedHazard;
  const hazardFieldId=hazard?.fieldId||state.fieldId;
  const source=BIO_HAZARDS[hazard?.hazardId]?.source;
  if(!state.fieldId||!hazard?.fieldId||!hazard.evidenceStatus){
    return finding('biofirewall.reported-hazard','UNKNOWN','unknown',state.fieldId,'A field identifier and a reported hazard evidence status are needed before this history can be assessed.',[...(!state.fieldId?['fieldIdentifier']:[]),...(!hazard?.fieldId?['hazardFieldIdentifier']:[]),...(!hazard?.evidenceStatus?['hazardEvidenceStatus']:[])],'Enter the affected field, hazard, and the evidence status supplied by the farmer.',{hazard,sources:source?[source]:[]});
  }
  if(hazard.evidenceStatus==='confirmed'||hazard.evidenceStatus==='suspected'){
    const evidenceStatus=hazard.evidenceStatus;
    const missing=hazard.recordedDate?[]:['hazardRecordDate'];
    return finding('biofirewall.reported-hazard','WARNING',evidenceStatus,hazardFieldId,
      evidenceStatus==='confirmed'?'Farmer-reported historical infection is recorded; the app has not independently verified the diagnosis.':'Farmer-reported suspected infection is recorded; it is not a confirmed diagnosis.',missing,'Verify the report and diagnosis with a qualified local plant-health specialist or diagnostic laboratory.',{hazard,sources:source?[source]:[]});
  }
  if(hazard.evidenceStatus==='no-reported-infection'){
    return finding('biofirewall.reported-hazard','UNKNOWN','no-reported-infection-history',hazardFieldId,'No infection history was reported. This does not establish that the field is disease-free.',[], 'Keep this as an unverified history and consult local plant-health guidance when relevant.',{hazard,sources:source?[source]:[]});
  }
  return finding('biofirewall.reported-hazard','UNKNOWN','unknown',hazardFieldId,'The hazard evidence status is unknown; no infection or absence is inferred.',['hazardEvidenceStatus'],'Confirm the evidence status from field records or an expert; do not infer disease-free status.',{hazard,sources:source?[source]:[]});
}

function exposureCheck(state){
  const fieldId=state.fieldId,hazard=state.reportedHazard;
  const incoming=state.equipmentMovements.filter(item=>item.toFieldId===fieldId||(!item.toFieldId&&fieldId));
  if(!fieldId||!incoming.length){
    return finding('biofirewall.equipment-exposure','UNKNOWN','unknown',fieldId,'No complete equipment movement into this field is recorded, so a source-to-target exposure path cannot be assessed.',[...(!fieldId?['fieldIdentifier']:[]),'equipmentMovementRecord'],'Record the equipment identity, source field, destination field, and source-use evidence; absence of a record is not proof of no exposure.',{hazard});
  }
  const movement=incoming.at(-1),missing=[];
  if(!movement.equipmentId)missing.push('equipmentIdentifier');
  if(!movement.fromFieldId)missing.push('movementSource');
  if(!movement.toFieldId)missing.push('movementDestination');
  if(!movement.movedAt)missing.push('movementDate');
  if(movement.sourceUseConfirmed===null)missing.push('sourceEquipmentUse');
  if(missing.length){
    return finding('biofirewall.equipment-exposure','UNKNOWN','unknown',fieldId,'The entered movement does not establish a complete chronological equipment path into this field.',missing,'Complete the equipment movement record, including whether it was used in the source field and when it moved.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId});
  }
  if(movement.sourceUseConfirmed===false){
    return finding('biofirewall.equipment-exposure','PASS','no-supported-equipment-path',fieldId,'This movement record explicitly says the equipment was not used in the reported source field. This clears only that recorded pathway and does not establish that any field is disease-free.',[],'Keep movement records complete and verify any other potential sources independently.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId});
  }
  if(!hazard||!hazard.fieldId||movement.fromFieldId!==hazard.fieldId||!['confirmed','suspected'].includes(hazard.evidenceStatus)){
    const sourceStatus=hazard?.evidenceStatus??'unknown';
    return finding('biofirewall.equipment-exposure','UNKNOWN',sourceStatus==='no-reported-infection'?'no-reported-infection-history':'unknown',fieldId,'The movement is recorded, but there is no matching confirmed or suspected hazard record for its source field. A no-reported-infection status is not proof that the source field is disease-free.',[!hazard?.fieldId?'hazardSourceRecord':movement.fromFieldId!==hazard?.fieldId?'matchingSourceHazardRecord':'hazardEvidenceStatus'],'Verify the source-field hazard and its evidence status; no exposure conclusion is inferred from missing history.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId});
  }
  if(!hazard.recordedDate||hazard.recordedDate>movement.movedAt){
    return finding('biofirewall.equipment-exposure','UNKNOWN','unknown',fieldId,'The source hazard record and equipment transfer are not in a supported chronological order.',[!hazard.recordedDate?'hazardRecordDate':'hazardBeforeMovement'],'Record a supported hazard date before the equipment movement date or verify the chronology.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId});
  }
  if(!BIO_HAZARDS[hazard.hazardId]){
    return finding('biofirewall.equipment-exposure','UNKNOWN','unknown',fieldId,'No sourced equipment-transfer rule is implemented for this reported hazard.',['supportedHazardRule'],'Ask a local plant-health specialist; this MVP does not infer exposure for unsupported hazards.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId});
  }
  const source=BIO_HAZARDS[hazard.hazardId].source;
  if(movement.cleaningStatus==='unknown'){
    return finding('biofirewall.equipment-exposure','UNKNOWN','unknown',fieldId,'A supported source-to-target path is recorded, but the cleaning status is unknown.',['equipmentCleaningStatus'],'Verify whether equipment soil was removed before entry and document the procedure and date.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId,sources:[source]});
  }
  const documented=movement.cleaningStatus==='documented-unvalidated';
  const missingInfo=documented?['validatedCleaningProtocol']:['equipmentCleaningRecord'];
  if(documented&&!movement.cleaningDate)missingInfo.push('cleaningDate');
  const reported=hazard.evidenceStatus==='confirmed'?'confirmed':'suspected';
  const cleaningText=documented?'A cleaning event is recorded, but no validated protocol/completion rule is available, so it cannot clear the potential exposure.':'No cleaning record is present for the supported equipment transfer.';
  return finding('biofirewall.equipment-exposure','WARNING','potential-exposure',fieldId,
    `${reported==='confirmed'?'A farmer-reported confirmed':'A farmer-reported suspected'} clubroot history in ${hazard.fieldId} precedes documented use of ${movement.equipmentId} there and its movement into ${fieldId}. ${cleaningText} This is a potential soil-transfer exposure only, not evidence of infection or transmission.`,missingInfo,
    'Avoid treating the field or equipment as cleared; verify the source report and cleaning history with a qualified local plant-health authority before acting.',{hazard,movement,sourceFieldId:movement.fromFieldId,equipmentId:movement.equipmentId,sources:[source]});
}

export function evaluateBioFirewall(value={}){
  const state=normalizeBioFirewall(value);
  return [historyCheck(state),exposureCheck(state)];
}
