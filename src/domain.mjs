import {validateBioFirewall} from './biofirewall.mjs';

export function parseCoordinates(text) {
  const parts = text.trim().split(',').map(x => x.trim());
  if (parts.length !== 2 || parts.some(x => !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(x))) throw Error('coordinates');
  const [lat, lon] = parts.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) throw Error('coordinates');
  return [lon, lat];
}
export function areaHa(points) {
  if (points.length < 3) return 0;
  const rad = Math.PI / 180;
  let sum = 0;
  points.forEach(([lon, lat], i) => {
    const [nextLon, nextLat] = points[(i + 1) % points.length];
    sum += (nextLon - lon) * rad * (2 + Math.sin(lat * rad) + Math.sin(nextLat * rad));
  });
  return Math.abs(sum * 6371008.8 ** 2 / 2) / 10000;
}
export function validatePolygon(p) {
  if (!Array.isArray(p) || p.length < 3 || p.length > 100) throw Error('polygon');
  for (const v of p) if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite) || Math.abs(v[0]) > 180 || Math.abs(v[1]) > 85) throw Error('polygon');
  if (new Set(p.map(x => x.join(','))).size !== p.length) throw Error('polygon');
  if (Math.max(...p.map(x => x[0])) - Math.min(...p.map(x => x[0])) > 2 || Math.max(...p.map(x => x[1])) - Math.min(...p.map(x => x[1])) > 2) throw Error('extent');
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
  const between = (a,b,c) => Math.min(a[0],b[0])<=c[0] && c[0]<=Math.max(a[0],b[0]) && Math.min(a[1],b[1])<=c[1] && c[1]<=Math.max(a[1],b[1]);
  const intersect = (a,b,c,d) => {const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return (x*y<0&&z*w<0)||(x===0&&between(a,b,c))||(y===0&&between(a,b,d))||(z===0&&between(c,d,a))||(w===0&&between(c,d,b));};
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
    if(j===i+1 || (i===0&&j===p.length-1))continue;
    if(intersect(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))throw Error('polygon');
  }
  const planarDoubleArea=p.reduce((sum,v,i)=>{const next=p[(i+1)%p.length];return sum+v[0]*next[1]-next[0]*v[1];},0);
  if(Math.abs(planarDoubleArea)<1e-12)throw Error('polygon');
  if (areaHa(p) < 0.001) throw Error('polygon');
  return p;
}
export function centerOf(p) { return [p.reduce((s,x)=>s+x[0],0)/p.length,p.reduce((s,x)=>s+x[1],0)/p.length]; }
export const crops = {wheat:{en:'Wheat',ar:'قمح',family:'grass'},maize:{en:'Maize',ar:'ذرة',family:'grass'},soy:{en:'Soybean',ar:'فول الصويا',family:'legume'},chickpea:{en:'Chickpea',ar:'حمص',family:'legume'},sunflower:{en:'Sunflower',ar:'دوار الشمس',family:'aster'}};
export const defaultRotations=[['wheat','maize','wheat'],['wheat','soy','sunflower'],['chickpea','wheat','soy']];
export function rotationSummary(sequence) {
  if(!Array.isArray(sequence)||!sequence.length||sequence.some(x=>!knownCrop(x)))throw Error('rotation');
  return {diversity:new Set(sequence.map(x=>crops[x].family)).size,legumes:sequence.filter(x=>crops[x].family==='legume').length,repeats:sequence.slice(1).filter((x,i)=>crops[x].family===crops[sequence[i]].family).length};
}
export function normalizeSavedRotations(rotations){
 if(!Array.isArray(rotations)||rotations.some(sequence=>!Array.isArray(sequence)||sequence.length!==3))throw Error('rotation');
 if(rotations.length===3){rotations.forEach(rotationSummary);return rotations.map(sequence=>[...sequence]);}
 if(rotations.length===2){const migrated=[...rotations.map(sequence=>[...sequence]),[...defaultRotations[2]]];migrated.forEach(rotationSummary);return migrated;}
 throw Error('rotation');
}
// Batch 02: advisory structural rules, not locally calibrated agronomic requirements.
export const rotationSources = {
 family:'https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/living-soil-healthy-garden',
 diversity:'https://www.fao.org/conservation-agriculture/overview/what-we-do/en/',
 legume:'https://extension.umn.edu/agriculture/crop-production/small-grains/small-grain-crop-rotations',
 climate:'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
 contract:'Field Shift Batch 02 rule contract: exactly three catalog crops; no validated local compatibility or climate thresholds.'
};
for (const [id,crop] of Object.entries(crops)) Object.assign(crop,{
 id,legume:['soy','chickpea'].includes(id),
 botanicalFamily:{grass:'Poaceae',legume:'Fabaceae',aster:'Asteraceae'}[crop.family],
 rotationConstraints:[],seasonalSuitability:null,climateRequirements:null,
 assumptions:'Family changes are advisory. Legume presence does not establish nitrogen credits or local suitability.',
 sources:[rotationSources.family,rotationSources.legume]
});
const knownCrop=id=>typeof id==='string'&&Object.hasOwn(crops,id);
export const rotationReasons={
 sequenceValid:'Three recognized crops are present; this validates structure only.',
 sequenceInvalid:'The plan must contain exactly three recognized crops. Agronomic evaluation is unavailable.',
 familyRepeat:'Consecutive crops share a family. Review shared pest and disease risks; this is an advisory flag, not a universal prohibition.',
 familyChange:'The adjacent crops have different families. This passes the family-change check only; shared pests can still occur.',
 diversityLow:'Only one family occurs in the plan. Consider diversification, subject to local constraints.',
 diversityPresent:'More than one family occurs in the plan. This records diversification, not a yield or soil benefit estimate.',
 legumePresent:'A legume is included. Nitrogen contribution depends on fixation, residues and management; no fertilizer credit is calculated.',
 legumeAbsent:'No legume is included. Review whether a legume fits local needs; inclusion is not universally required.',
 historyMissing:'The immediately preceding crop is unknown. Earlier rotation history and disease exposure are not assessed.',
 compatibilityUnknown:'Local pest, disease, soil and management constraints are not documented. Family changes do not establish compatibility.',
 climateUnknown:'POWER observations describe the requested historical period at a grid point. Annual summaries cannot establish crop-season suitability; no validated crop requirements are encoded.'
};
/** Pure API: rotation = three crop IDs; context.previousCrop = optional immediate
 * predecessor; climateData = parsePowerDaily/fetchPowerClimate normalized output.
 * season is 1-based, or null for whole-plan checks. PASS applies only to that rule.
 * FAIL denotes an invalid input contract, not a fabricated agronomic prohibition.
 * No supported crop-specific compatibility/climate requirement exists in this MVP.
 */
export function evaluateRotation(rotation, fieldContext={}, climateData=null) {
 const checks=[];
 const add=(id,season,result,reason,inputs,source,missing=[])=>checks.push({id,season,result,reason,explanation:rotationReasons[reason],inputs,source,missing});
 const valid=Array.isArray(rotation)&&rotation.length===3&&rotation.every(knownCrop);
 add('sequence',null,valid?'PASS':'FAIL',valid?'sequenceValid':'sequenceInvalid',{sequence:Array.isArray(rotation)?[...rotation]:null},rotationSources.contract,valid?[]:['threeCatalogCrops']);
 if(!valid)return {sequence:Array.isArray(rotation)?[...rotation]:[],checks,status:'FAIL'};
 for(let i=1;i<3;i++){
  const repeated=crops[rotation[i-1]].family===crops[rotation[i]].family;
  add('family',i+1,repeated?'WARNING':'PASS',repeated?'familyRepeat':'familyChange',{previousCrop:rotation[i-1],crop:rotation[i]},rotationSources.family);
 }
 const families=[...new Set(rotation.map(id=>crops[id].botanicalFamily))];
 add('diversity',null,families.length>1?'PASS':'WARNING',families.length>1?'diversityPresent':'diversityLow',{families},rotationSources.diversity);
 const legumes=rotation.filter(id=>crops[id].legume);
 add('legume',null,legumes.length?'PASS':'WARNING',legumes.length?'legumePresent':'legumeAbsent',{legumes},rotationSources.legume);
 const previous=fieldContext?.previousCrop;
 const repeated=knownCrop(previous)&&crops[previous].family===crops[rotation[0]].family;
 add('history',1,knownCrop(previous)?(repeated?'WARNING':'PASS'):'UNKNOWN',knownCrop(previous)?(repeated?'familyRepeat':'familyChange'):'historyMissing',{previousCrop:knownCrop(previous)?previous:null,crop:rotation[0]},rotationSources.family,knownCrop(previous)?[]:['previousCrop']);
 add('compatibility',null,'UNKNOWN','compatibilityUnknown',{sequence:[...rotation]},rotationSources.contract,['localConstraints','diseaseHistory','soilManagement']);
 const observations={},missing=[];
 for(const [name,unit,stat] of [['precipitation','mm/day','sum'],['temperatureMax','C','mean'],['temperatureMin','C','mean']]){
  const c=climateData?.source==='NASA POWER'?climateData.channels?.[name]:null;
  const usable=c?.available===true&&c.unit===unit&&Number.isFinite(c.summary?.[stat]);
  observations[name]={value:usable?c.summary[stat]:null,unit:name==='precipitation'?'mm':'C',validDays:usable?c.summary.validDays:0,daysInSeries:c?.summary?.daysInSeries??0};
  if(!usable)missing.push(name);
 }
 for(let i=0;i<3;i++)add('climate',i+1,'UNKNOWN','climateUnknown',{
  crop:rotation[i],observations:structuredClone(observations),
  period:climateData?.period?{...climateData.period}:null,
  coordinates:climateData?.coordinates?{...climateData.coordinates}:null,
  aggregation:'historical period total precipitation and mean daily maximum/minimum temperatures; not crop-season conditions'
 },rotationSources.climate,[...missing,'cropCalendar','cropRequirements','seasonalCoverage','waterManagement']);
 return {sequence:[...rotation],checks,status:'UNKNOWN'};
}
/** Same evidence for all plans; differences are rule outcomes/inputs, never scores. */
export function compareRotations(rotations, fieldContext={}, climateData=null) {
 const evaluations=rotations.map(r=>evaluateRotation(r,fieldContext,climateData));
 const keys=[...new Set(evaluations.flatMap(e=>e.checks.map(c=>`${c.id}:${c.season}`)))];
 const differences=keys.flatMap(key=>{
  const checks=evaluations.map(e=>e.checks.find(c=>`${c.id}:${c.season}`===key)??null);
  if(new Set(checks.map(c=>JSON.stringify(c&&{result:c.result,inputs:c.inputs}))).size<2)return [];
  const c=checks.find(Boolean);return [{id:c.id,season:c.season,checks}];
 });
 return {evaluations,differences,winner:null,conclusion:'insufficientEvidence'};
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function parseWeather(json) {
  if(!json?.current || typeof json.current.time!=='string' || !json.current_units)throw Error('no-data');
  const c=json.current;
  return {time:c.time,temperature:json.current_units.temperature_2m==='°C'?finite(c.temperature_2m):null,rain:json.current_units.precipitation==='mm'?finite(c.precipitation):null,wind:json.current_units.wind_speed_10m==='km/h'?finite(c.wind_speed_10m):null,humidity:json.current_units.relative_humidity_2m==='%'?finite(c.relative_humidity_2m):null,latitude:finite(json.latitude),longitude:finite(json.longitude),timezone:json.timezone||'UTC',daily:json.daily||null};
}
export function parseClimate(json,country) {
 const series=json?.data?.tas?.[country] ?? json?.data?.[country];
 const values=Object.values(series||{});
 if(values.length!==1 || finite(values[0])===null || values[0]<-20 || values[0]>30)throw Error('no-data');
 return values[0];
}
export function climateUrl(country,scenario,period) {
 if(!/^[A-Z]{3}$/.test(country)||!['ssp126','ssp245','ssp585'].includes(scenario)||!['2020-2039','2040-2059','2060-2079','2080-2099'].includes(period))throw Error('query');
 return 'https://cckpapi.worldbank.org/cckp/v1/cmip6-x0.25_climatology_tas_anomaly_annual_'+period+'_median_'+scenario+'_ensemble_all_mean/'+country+'?_format=json';
}
export async function fetchJson(url, signal) {
 const response=await fetch(url,{signal:signal||AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const data=await response.json();
 if(data?.error)throw Error('service');
 return data;
}
function validateSavedPreflight(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('preflight');
 const budget=value.waterBudget;
 if(!budget||typeof budget!=='object'||Array.isArray(budget)||!['mm','m3'].includes(budget.unit)||!['perSeason','wholePlan'].includes(budget.period))throw Error('preflight');
 const amount=budget.amount;
 if(!(typeof amount==='string'&&amount.trim()==='')&&!(typeof amount==='string'&&Number.isFinite(Number(amount))&&Number(amount)>=0)&&!(typeof amount==='number'&&Number.isFinite(amount)&&amount>=0))throw Error('preflight');
 if(!Array.isArray(value.plantingDates)||value.plantingDates.length!==3||value.plantingDates.some(date=>typeof date!=='string'||(date!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date))))throw Error('preflight');
 if(typeof value.illustrativeCropSettings!=='boolean'||typeof value.effectiveRainfallSlopeConfirmed!=='boolean')throw Error('preflight');
}
export function readSaved(raw) {
 const value=JSON.parse(raw);
 if(value.version!==1)throw Error('version');
 if(value.preflightInputs!==undefined)validateSavedPreflight(value.preflightInputs);
 if(value.biofirewall!==undefined)validateBioFirewall(value.biofirewall);
 if(value.previousCrop!==undefined&&value.previousCrop!==null&&!knownCrop(value.previousCrop))throw Error('history');
 validatePolygon(value.polygon);
 value.rotations=normalizeSavedRotations(value.rotations);
 if(!['USA','PSE','EGY','JOR','IND','ESP','FRA','KEN','BRA','AUS'].includes(value.country))throw Error('country');
 climateUrl(value.country,value.scenario,value.period);
 return value;
}

export function decodeTerrain(pixel){
 if(!pixel||pixel.length!==4||!Array.from(pixel).every(x=>Number.isInteger(x)&&x>=0&&x<=255)||pixel[3]===0)throw Error('no-data');
 const metres=pixel[0]*256+pixel[1]+pixel[2]/256-32768;
 if(metres<=-11000||metres>9000)throw Error('no-data');
 return metres;
}
