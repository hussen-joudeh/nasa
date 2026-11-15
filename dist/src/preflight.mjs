import {areaHa as measureAreaHa, evaluateRotation, validatePolygon} from './domain.mjs';
import {estimateWaterTruth} from './water-truth.mjs';
import {evaluateBioFirewall} from './biofirewall.mjs';

const allStatuses=['PASS','WARNING','FAIL','UNKNOWN'];
function deriveStatus(checks){
  const statuses=checks.map(check=>check.status);
  if(statuses.includes('FAIL'))return 'FAIL';
  if(statuses.includes('UNKNOWN'))return 'UNKNOWN';
  if(statuses.includes('WARNING'))return 'WARNING';
  return 'PASS';
}
function summarizeStatuses(checks){
  return Object.fromEntries(allStatuses.map(status=>[status,checks.filter(check=>check.status===status).length]));
}
function nextRotationStep(check){
  if(check.id==='sequence')return 'Use exactly three crops from the catalog.';
  if(check.reason==='familyRepeat')return 'Verify shared pest and disease risks with local crop-history guidance.';
  if(check.id==='history')return 'Record the immediately preceding crop if known; otherwise keep history UNKNOWN.';
  if(check.id==='compatibility')return 'Verify local pest, disease, soil, and management constraints.';
  if(check.id==='climate')return 'Use crop-season observations and validated local crop requirements; annual summaries are insufficient.';
  return 'Review the cited rotation guidance and local field conditions.';
}
function normalizeRotationCheck(check){
  return {
    ruleId:`rotation.${check.id}`,
    status:check.result,
    explanation:check.explanation,
    season:check.season??null,
    evidence:{source:check.source,reason:check.reason},
    inputs:check.inputs??{},
    missingInformation:Array.isArray(check.missing)?[...check.missing]:[],
    nextStep:nextRotationStep(check),
  };
}

/** Run the pre-planting decision checks for one existing three-season rotation. */
export function runPreflight(rotation,fieldContext={},climateData=null){
  const context={...fieldContext};
  let resolvedArea=typeof context.areaHa==='number'&&Number.isFinite(context.areaHa)&&context.areaHa>0?context.areaHa:null;
  if(!resolvedArea&&Array.isArray(context.polygon)){
    try{validatePolygon(context.polygon);resolvedArea=measureAreaHa(context.polygon);}catch{resolvedArea=null;}
  }
  context.areaHa=resolvedArea;
  const rotationEvaluation=evaluateRotation(rotation,context,climateData);
  const water=estimateWaterTruth(rotation,context,climateData);
  const biofirewallChecks=evaluateBioFirewall(context.biofirewall);
  const checks=[...rotationEvaluation.checks.map(normalizeRotationCheck),...water.checks,...biofirewallChecks];
  const statuses=summarizeStatuses(checks);
  return {
    rotation:{sequence:[...rotationEvaluation.sequence],status:rotationEvaluation.status},
    field:{areaHa:resolvedArea,geometryAvailable:!!resolvedArea},
    climate:{source:climateData?.source??null,period:climateData?.period?{...climateData.period}:null},
    water,
    biofirewall:{checks:biofirewallChecks},
    checks,
    statuses,
    status:deriveStatus(checks),
  };
}
