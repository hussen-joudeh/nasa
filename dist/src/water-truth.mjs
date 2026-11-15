import {areaHa as measureAreaHa} from './domain.mjs';

export const WATER_SOURCES={
  fao56:'https://www.fao.org/4/X0490E/x0490e00.htm',
  faoEffectiveRainfall:'https://www.fao.org/4/s2022e/s2022e08.htm',
  nasaPowerDaily:'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
};

// Explicit demonstration templates from FAO-56 Tables 11–12. The rows span
// different regions and are not locally validated for a user's field/cultivar.
export const ILLUSTRATIVE_CROP_SETTINGS={
  wheat:{
    sourceRegion:'California Desert, USA (FAO-56 Table 11 reference row)',
    stageDays:{initial:20,development:50,mid:60,late:30},
    kc:{initial:[0.3,0.3],mid:[1.15,1.15],end:[0.25,0.4]},
    note:'Illustrative wheat/cereal Kc curve; wheat type and local calendar are not validated.',
  },
  maize:{
    sourceRegion:'Spain spring/summer or California (FAO-56 Table 11 reference row)',
    stageDays:{initial:30,development:40,mid:50,late:30},
    kc:{initial:[0.3,0.3],mid:[1.2,1.2],end:[0.35,0.6]},
    note:'Illustrative field-grain maize; Kc end range reflects harvest-moisture conditions.',
  },
  soy:{
    sourceRegion:'Central USA, May planting (FAO-56 Table 11 reference row)',
    stageDays:{initial:20,development:35,mid:60,late:25},
    kc:{initial:[0.4,0.4],mid:[1.15,1.15],end:[0.5,0.5]},
    note:'FAO-56 Table 11 shows 30/35 development days and a 140-day total; 35 is used to match that total.',
  },
  sunflower:{
    sourceRegion:'Mediterranean/California, April–May (FAO-56 Table 11 reference row)',
    stageDays:{initial:25,development:35,mid:45,late:25},
    kc:{initial:[0.35,0.35],mid:[1.0,1.15],end:[0.35,0.35]},
    note:'Illustrative sunflower Kc-mid range and stage lengths; not locally calibrated.',
  },
};

const statuses=new Set(['PASS','WARNING','FAIL','UNKNOWN']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const addDays=(iso,days)=>{
  const date=new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
};
const toKey=iso=>iso.replaceAll('-','');
function validIsoDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function dayOfYear(iso){
  const date=new Date(`${iso}T00:00:00Z`);
  return Math.floor((date-Date.UTC(date.getUTCFullYear(),0,0))/86400000);
}
function raMmPerDay(latitude,date){
  const j=dayOfYear(date),phi=latitude*Math.PI/180;
  const angle=2*Math.PI*j/365;
  const inverseDistance=1+0.033*Math.cos(angle);
  const declination=0.409*Math.sin(angle-1.39);
  const sunset=Math.acos(Math.max(-1,Math.min(1,-Math.tan(phi)*Math.tan(declination))));
  const raMj=(24*60/Math.PI)*0.0820*inverseDistance*(sunset*Math.sin(phi)*Math.sin(declination)+Math.cos(phi)*Math.cos(declination)*Math.sin(sunset));
  return 0.408*raMj;
}

/** FAO-56 Hargreaves-Samani estimate. ETo is mm/day; Ra is converted to mm/day. */
export function hargreavesSamaniETo({tmaxC,tminC,latitude,date}={}){
  if(!finite(tmaxC)||!finite(tminC)||!finite(latitude)||Math.abs(latitude)>85||!validIsoDate(date)||tmaxC<tminC)return null;
  const tmean=(tmaxC+tminC)/2;
  const ra=raMmPerDay(latitude,date);
  const eto=0.0023*(tmean+17.8)*Math.sqrt(tmaxC-tminC)*ra;
  return finite(eto)?Math.max(0,eto):null;
}

export function millimetresToCubicMetres(depthMm,areaHectares){
  if(!finite(depthMm)||depthMm<0||!finite(areaHectares)||areaHectares<=0)throw new RangeError('water-units');
  return depthMm*areaHectares*10;
}
export function cubicMetresToMillimetres(volumeM3,areaHectares){
  if(!finite(volumeM3)||volumeM3<0||!finite(areaHectares)||areaHectares<=0)throw new RangeError('water-units');
  return volumeM3/(areaHectares*10);
}

function effectiveRainfall30Days(precipMm){
  if(!finite(precipMm)||precipMm<0)return null;
  return Math.max(0,precipMm<75?0.6*precipMm-10:0.8*precipMm-25);
}
function makeCheck(ruleId,status,explanation,season,evidence,inputs,missingInformation,nextStep){
  return {ruleId,status,explanation,season,evidence,inputs,missingInformation,nextStep};
}
function deriveStatus(values){
  if(values.includes('FAIL'))return 'FAIL';
  if(values.includes('UNKNOWN'))return 'UNKNOWN';
  if(values.includes('WARNING'))return 'WARNING';
  return 'PASS';
}
function getArea(context){
  if(finite(context?.areaHa)&&context.areaHa>0)return context.areaHa;
  if(Array.isArray(context?.polygon)){
    try{const computed=measureAreaHa(context.polygon);if(finite(computed)&&computed>0)return computed;}catch{}
  }
  return null;
}
function readBudget(raw,area){
  if(!raw||typeof raw!=='object')return null;
  const amount=typeof raw.amount==='string'&&raw.amount.trim()!==''?Number(raw.amount):raw.amount;
  if(!finite(amount)||amount<0||!['mm','m3'].includes(raw.unit)||!['perSeason','wholePlan'].includes(raw.period))return null;
  if(!finite(area)||area<=0)return null;
  const mm=raw.unit==='mm'?amount:cubicMetresToMillimetres(amount,area);
  const m3=raw.unit==='m3'?amount:millimetresToCubicMetres(amount,area);
  return {amount,unit:raw.unit,period:raw.period,mm,m3,basis:'field-application'};
}
function channelUsable(channel,units){return channel?.available===true&&units.includes(channel.unit)&&channel.daily&&typeof channel.daily==='object';}
function climateChannels(climate){
  const c=climate?.channels;
  if(climate?.source!=='NASA POWER'||!finite(climate?.coordinates?.latitude)||Math.abs(climate.coordinates.latitude)>85)return null;
  if(!channelUsable(c?.temperatureMax,['C','°C'])||!channelUsable(c?.temperatureMin,['C','°C'])||!channelUsable(c?.precipitation,['mm/day','mm d-1']))return null;
  return c;
}
function kcAt(template,day,upper){
  const stages=template.stageDays,kc=template.kc;
  const endpoint=index=>kc[index][upper?1:0];
  const initialEnd=stages.initial;
  const developmentEnd=initialEnd+stages.development;
  const midEnd=developmentEnd+stages.mid;
  if(day<initialEnd)return endpoint('initial');
  if(day<developmentEnd){
    const step=day-initialEnd+1;
    const ratio=step/stages.development;
    return endpoint('initial')+(endpoint('mid')-endpoint('initial'))*ratio;
  }
  if(day<midEnd)return endpoint('mid');
  const step=day-midEnd+1;
  const ratio=Math.min(1,step/stages.late);
  return endpoint('mid')+(endpoint('end')-endpoint('mid'))*ratio;
}
function checkContext(climate,period){
  return {source:'NASA POWER',dataset:climate?.dataset??null,period:period??null,coordinates:climate?.coordinates??null,timeStandard:climate?.timeStandard??null};
}
function unknownSeason(season,crop,plantingDate,missing,explanation,methodEvidence){
  return {
    season,crop,plantingDate:validIsoDate(plantingDate)?plantingDate:null,harvestDate:null,
    status:'UNKNOWN',calculationStatus:'UNKNOWN',budgetStatus:'UNKNOWN',
    referenceEtoMm:null,cropEtcMm:null,needMm:null,needM3:null,effectivePrecipitationMm:null,
    precipitationMm:null,remainingMm:null,remainingM3:null,deficitMm:null,deficitM3:null,
    missingInformation:missing,explanation,methodEvidence,
  };
}
function budgetStatusFor(needMm,budgetMm,partialBlock){
  if(!needMm||!finite(budgetMm))return 'UNKNOWN';
  if(needMm.max<=budgetMm)return 'PASS';
  if(needMm.min>budgetMm)return partialBlock?'WARNING':'FAIL';
  return 'WARNING';
}

/**
 * Estimate a seasonal field-application requirement for each slot in a
 * three-crop rotation. Crop coefficients/calendars are opt-in demonstrations.
 * FAO's empirical effective-rainfall formula is applied to consecutive
 * 30-day periods; final partial periods receive no rainfall credit.
 */
export function estimateWaterTruth(rotation,fieldContext={},climateData=null){
  const checks=[],seasons=[];
  const area=getArea(fieldContext);
  const channels=climateChannels(climateData);
  const budget=readBudget(fieldContext.waterBudget,area);
  const dates=fieldContext.plantingDates;
  const climatePeriod=climateData?.period??null;
  const scenarioLabel='historical-climate-analogue';
  const evidence=checkContext(climateData,climatePeriod);

  checks.push(makeCheck('water.field-area',area?'PASS':'UNKNOWN',area?'Field area comes from the proposed boundary polygon (spherical WGS84), not a cadastral parcel.':'A valid field area is required for depth-to-volume conversion.',null,evidence,{areaHa:area},area?[]:['fieldArea'],area?'Confirm the drawn boundary matches the irrigated parcel you intend to model.':'Draw a proposed field boundary before comparing volumes.'));
  checks.push(makeCheck('water.budget',budget?'PASS':'UNKNOWN',budget?'A non-negative field-application budget and its unit/period are provided.':'The irrigation budget, unit, period, or field area is missing or invalid.',null,evidence,{budget:budget??fieldContext.waterBudget??null,areaHa:area},budget?[]:['availableIrrigationBudget','budgetUnit','budgetPeriod'],budget?'Confirm the amount is water delivered for field application, not an unadjusted source withdrawal.':'Enter the available field-applied water amount, unit, and applicable period.'));
  checks.push(makeCheck('water.climate-support',channels?'WARNING':'UNKNOWN',channels?'NASA POWER daily Tmax/Tmin and precipitation support a historical Hargreaves-Samani scenario; wind/humidity inputs for FAO-56 Penman-Monteith are absent.':'Required NASA POWER daily temperature, precipitation, coordinates, or units are unavailable.',null,evidence,{source:climateData?.source??null,period:climatePeriod,parameters:climateData?.provenance?.parameters??null},channels?[]:['dailyTemperatureMax','dailyTemperatureMin','dailyPrecipitation','fieldLatitude'],channels?'Treat this as a historical analogue, then compare ETo locally against a FAO-56 Penman-Monteith station estimate when available.':'Fetch a complete NASA POWER daily series at the field centre.'));
  checks.push(makeCheck('water.crop-settings',fieldContext.illustrativeCropSettings===true?'WARNING':'UNKNOWN',fieldContext.illustrativeCropSettings===true?'Illustrative FAO-56 crop coefficients and stage lengths are enabled; they are not locally validated.':'No locally validated crop coefficients and calendar were supplied, and illustrative settings are not enabled.',null,evidence,{illustrativeCropSettings:fieldContext.illustrativeCropSettings===true},fieldContext.illustrativeCropSettings===true?[]:['cropCoefficients','cropGrowthStageCalendar'],fieldContext.illustrativeCropSettings===true?'Verify crop, cultivar, planting window, and stage lengths with a local agronomist.':'Supply local crop coefficients and stage dates, or explicitly enable the illustrative FAO-56 demonstration templates.'));
  checks.push(makeCheck('water.effective-rainfall-scope',fieldContext.effectiveRainfallSlopeConfirmed===true?'WARNING':'UNKNOWN',fieldContext.effectiveRainfallSlopeConfirmed===true?'The user confirms the field maximum slope is within the FAO manual simple-method scope (about 4–5%); a 30-day accounting-period approximation is used.':'The FAO simple effective-rainfall method requires a confirmed field slope within its stated about-4–5% scope.',null,evidence,{slopeAtMostFivePercent:fieldContext.effectiveRainfallSlopeConfirmed===true,accountingPeriodDays:30},fieldContext.effectiveRainfallSlopeConfirmed===true?[]:['fieldSlopeApplicability'],fieldContext.effectiveRainfallSlopeConfirmed===true?'Verify the field slope and the method applicability locally; the 30-day bins approximate monthly totals.':'Confirm the field slope is at most 5%, or provide a supported soil-water-balance method.'));

  const validRotation=Array.isArray(rotation)&&rotation.length===3;
  for(let index=0;index<3;index++){
    const season=index+1,crop=validRotation?rotation[index]:null,plantingDate=Array.isArray(dates)?dates[index]:null;
    const template=fieldContext.illustrativeCropSettings===true?ILLUSTRATIVE_CROP_SETTINGS[crop]:null;
    const missing=[];
    if(!validRotation||typeof crop!=='string')missing.push('threeCropRotation');
    if(!area)missing.push('fieldArea');
    if(!template)missing.push(fieldContext.illustrativeCropSettings===true?'cropGrowthStageCalendar':'cropCoefficientsAndCalendar');
    if(!validIsoDate(plantingDate))missing.push('seasonPlantingDate');
    if(fieldContext.effectiveRainfallSlopeConfirmed!==true)missing.push('fieldSlopeApplicability');
    if(!channels)missing.push('nasaPowerDailyInputs');
    if(missing.length){
      const seasonResult=unknownSeason(season,crop,plantingDate,missing,'The crop-season water comparison is UNKNOWN until every critical input and supported method requirement is present.',evidence);
      seasons.push(seasonResult);
      checks.push(makeCheck('water.season-data',channels?'UNKNOWN':'UNKNOWN',seasonResult.explanation,season,evidence,{crop,plantingDate,areaHa:area,budget:budget??null},missing,'Provide the missing field, water, crop-calendar, slope, and NASA daily inputs listed for this season.'));
      checks.push(makeCheck('water.balance','UNKNOWN','A seasonal irrigation balance cannot be compared while critical inputs are missing.',season,evidence,{crop,plantingDate,budget:budget??null},missing,'Resolve the missing information before interpreting a water deficit or remaining budget.'));
      continue;
    }

    const duration=Object.values(template.stageDays).reduce((sum,value)=>sum+value,0);
    const harvestDate=addDays(plantingDate,duration-1);
    const firstKey=toKey(plantingDate),lastKey=toKey(harvestDate);
    if(firstKey<climateData.period.start||lastKey>climateData.period.end){
      const seasonResult=unknownSeason(season,crop,plantingDate,['completeCropSeasonWithinNASAObservedPeriod'],`The ${duration}-day crop cycle (${plantingDate}–${harvestDate}) is not fully covered by the NASA POWER period.`,evidence);
      seasonResult.harvestDate=harvestDate;
      seasons.push(seasonResult);
      checks.push(makeCheck('water.season-coverage','UNKNOWN',seasonResult.explanation,season,evidence,{crop,plantingDate,harvestDate,durationDays:duration},seasonResult.missingInformation,'Choose a planting date whose complete crop cycle lies within the retrieved historical period; do not extend the data into future years.'));
      checks.push(makeCheck('water.balance','UNKNOWN','The crop-season climate coverage is incomplete, so no seasonal irrigation balance is produced.',season,evidence,{crop,plantingDate,harvestDate},seasonResult.missingInformation,'Use a fully observed crop-season window or another documented historical dataset.'));
      continue;
    }

    const records=[],missingDays=[];
    const start=new Date(`${plantingDate}T00:00:00Z`);
    for(let day=0;day<duration;day++){
      const iso=addDays(plantingDate,day),key=toKey(iso);
      const tmax=channels.temperatureMax.daily[key],tmin=channels.temperatureMin.daily[key],precip=channels.precipitation.daily[key];
      if(!finite(tmax)||!finite(tmin)||!finite(precip)||precip<0||tmax<tmin){missingDays.push(iso);continue;}
      const eto=hargreavesSamaniETo({tmaxC:tmax,tminC:tmin,latitude:climateData.coordinates.latitude,date:iso});
      if(!finite(eto)){missingDays.push(iso);continue;}
      records.push({iso,eto,precip,day});
    }
    if(missingDays.length){
      const seasonResult=unknownSeason(season,crop,plantingDate,['dailyClimateObservation'],`NASA POWER is missing or invalid for ${missingDays.length} day(s) in the crop cycle.`,evidence);
      seasonResult.harvestDate=harvestDate;seasonResult.missingDays=missingDays.slice(0,10);
      seasons.push(seasonResult);
      checks.push(makeCheck('water.daily-completeness','UNKNOWN',seasonResult.explanation,season,{...evidence,missingDayCount:missingDays.length},{crop,plantingDate,harvestDate,missingDays:missingDays.slice(0,10)},seasonResult.missingInformation,'Re-fetch or verify the missing NASA POWER days; do not silently interpolate them.'));
      checks.push(makeCheck('water.balance','UNKNOWN','Missing daily weather observations prevent a seasonal crop-water estimate.',season,evidence,{crop,plantingDate,missingDayCount:missingDays.length},seasonResult.missingInformation,'Resolve daily data gaps before comparing the water budget.'));
      continue;
    }

    const blocks=[];
    for(let offset=0;offset<records.length;offset+=30){
      const block=records.slice(offset,offset+30);
      const rain=block.reduce((sum,row)=>sum+row.precip,0);
      const etcMin=block.reduce((sum,row)=>sum+row.eto*kcAt(template,row.day,false),0);
      const etcMax=block.reduce((sum,row)=>sum+row.eto*kcAt(template,row.day,true),0);
      const full=block.length===30;
      const effective=full?effectiveRainfall30Days(rain):0;
      blocks.push({days:block.length,precipitationMm:rain,effectivePrecipitationMm:effective,cropEtcMm:{min:etcMin,max:etcMax},needMm:{min:Math.max(0,etcMin-effective),max:Math.max(0,etcMax-effective)},effectiveRainCreditOmitted:!full});
    }
    const partialBlock=blocks.some(block=>block.effectiveRainCreditOmitted);
    const etoTotal=records.reduce((sum,row)=>sum+row.eto,0);
    const etcMin=blocks.reduce((sum,block)=>sum+block.cropEtcMm.min,0);
    const etcMax=blocks.reduce((sum,block)=>sum+block.cropEtcMm.max,0);
    const effectiveTotal=blocks.reduce((sum,block)=>sum+block.effectivePrecipitationMm,0);
    const precipitationTotal=records.reduce((sum,row)=>sum+row.precip,0);
    const need={min:blocks.reduce((sum,block)=>sum+block.needMm.min,0),max:blocks.reduce((sum,block)=>sum+block.needMm.max,0)};
    const needM3={min:millimetresToCubicMetres(need.min,area),max:millimetresToCubicMetres(need.max,area)};
    const isPerSeason=budget?.period==='perSeason';
    const seasonBudgetStatus=isPerSeason?budgetStatusFor(need,budget.mm,partialBlock):null;
    const calculationStatus='WARNING';
    const balanceStatus=isPerSeason?seasonBudgetStatus:(budget?'WARNING':'UNKNOWN');
    const seasonStatus=deriveStatus([calculationStatus,balanceStatus]);
    const remainingMm=isPerSeason?{min:budget.mm-need.max,max:budget.mm-need.min}:null;
    const deficitMm=isPerSeason?{min:Math.max(0,need.min-budget.mm),max:Math.max(0,need.max-budget.mm)}:null;
    const remainingM3=isPerSeason?{min:budget.m3-needM3.max,max:budget.m3-needM3.min}:null;
    const deficitM3=isPerSeason?{min:Math.max(0,needM3.min-budget.m3),max:Math.max(0,needM3.max-budget.m3)}:null;
    const settingsEvidence={
      source:WATER_SOURCES.fao56,sourceRegion:template.sourceRegion,
      stageDays:{...template.stageDays},kc:{initial:[...template.kc.initial],mid:[...template.kc.mid],end:[...template.kc.end]},
      templateNote:template.note,
    };
    const seasonResult={
      season,crop,plantingDate,harvestDate,durationDays:duration,status:seasonStatus,
      calculationStatus,budgetStatus:seasonBudgetStatus,referenceEtoMm:etoTotal,
      cropEtcMm:{min:etcMin,max:etcMax},effectivePrecipitationMm:effectiveTotal,
      precipitationMm:precipitationTotal,needMm:need,needM3,
      budget:{...budget,comparisonMm:isPerSeason?budget.mm:null,comparisonM3:isPerSeason?budget.m3:null},
      remainingMm,remainingM3,deficitMm,deficitM3,
      blocks,partialBlock,missingInformation:[],
      assumptions:['hargreavesApproximation','illustrativeCropSettings','effectiveRainfall30DayBlocks','fieldAppliedBudget'],
      methodEvidence:settingsEvidence,
    };
    seasons.push(seasonResult);
    checks.push(makeCheck('water.daily-completeness','PASS','All daily Tmax, Tmin, and corrected precipitation observations are present and valid for the modeled crop cycle.',season,{...evidence,validDays:records.length},{crop,plantingDate,harvestDate,validDays:records.length},[],'Confirm the selected historical window is representative for the field; it is not a forecast.'));
    checks.push(makeCheck('water.reference-eto','WARNING','Daily ETo uses the documented Hargreaves-Samani approximation because the current NASA POWER series lacks humidity and wind required for FAO-56 Penman-Monteith.',season,{...evidence,source:WATER_SOURCES.fao56,method:'Hargreaves-Samani',unit:'mm/day'},{latitude:climateData.coordinates.latitude,temperatureMaxUnit:channels.temperatureMax.unit,temperatureMinUnit:channels.temperatureMin.unit,referenceEtoMm:etoTotal},[],'Compare this historical Hargreaves estimate with a local FAO-56 Penman-Monteith estimate when humidity and wind observations are available.'));
    checks.push(makeCheck('water.crop-etc','WARNING','ETc is computed as Kc × ETo using opt-in FAO-56 illustrative stage and coefficient settings.',season,{...evidence,source:WATER_SOURCES.fao56,settings:settingsEvidence},{crop,plantingDate,harvestDate,durationDays:duration,cropEtcMm:{min:etcMin,max:etcMax}},[],'Confirm the cultivar-specific crop stages and Kc values with a local agronomist.'));
    checks.push(makeCheck('water.effective-rainfall',partialBlock?'WARNING':'WARNING','NASA POWER precipitation is reduced with the FAO simple effective-rainfall equation; only complete 30-day blocks receive credit, and soil storage/runoff are not modeled.',season,{...evidence,source:WATER_SOURCES.faoEffectiveRainfall,method:'Pe = max(0, 0.6P − 10) below 75 mm; otherwise max(0, 0.8P − 25); P in mm per 30-day block.'},{precipitationMm:precipitationTotal,effectivePrecipitationMm:effectiveTotal,accountingBlocks:blocks.length,partialBlock,fieldSlopeAtMostFivePercent:true},[],'Verify slope applicability and local effective rainfall; supply soil/root-zone data for a site-specific water balance.'));
    checks.push(makeCheck('water.balance',seasonBudgetStatus??'UNKNOWN',isPerSeason?(seasonBudgetStatus==='PASS'?'The field-applied seasonal water budget covers the modeled irrigation-need range.':seasonBudgetStatus==='FAIL'?'The modeled seasonal irrigation-need range exceeds the available field-applied budget.':seasonBudgetStatus==='WARNING'?'The modeled budget comparison is conditional; uncertainty or a partial 30-day block prevents a definitive shortfall.':'The seasonal budget comparison is unavailable.'):'The budget covers the complete plan, so water sufficiency is evaluated at plan level.',season,{...evidence,methodSources:[WATER_SOURCES.fao56,WATER_SOURCES.faoEffectiveRainfall]},{crop,needMm:need,needM3,waterBudget:budget,remainingMm,deficitMm,partialBlock},isPerSeason?[]:['planLevelBudget'],isPerSeason?'Confirm actual field-applied water delivery and local assumptions.':'Review the whole-plan comparison below; this per-season row is not a separate budget pass.'));
  }

  let budgetComparison;
  const complete=seasons.length===3&&seasons.every(item=>item.needMm&&item.needM3);
  const totals=complete?{
    needMm:{min:seasons.reduce((sum,item)=>sum+item.needMm.min,0),max:seasons.reduce((sum,item)=>sum+item.needMm.max,0)},
    needM3:{min:seasons.reduce((sum,item)=>sum+item.needM3.min,0),max:seasons.reduce((sum,item)=>sum+item.needM3.max,0)},
  }:null;
  if(!budget){
    budgetComparison={period:fieldContext.waterBudget?.period??null,status:'UNKNOWN',needMm:totals?.needMm??null,needM3:totals?.needM3??null,budgetMm:null,budgetM3:null,remainingMm:null,remainingM3:null,deficitMm:null,deficitM3:null};
  }else if(budget.period==='wholePlan'){
    const partial=seasons.some(item=>item.partialBlock);
    const status=complete?budgetStatusFor(totals.needMm,budget.mm,partial):'UNKNOWN';
    const remainingMm=complete?{min:budget.mm-totals.needMm.max,max:budget.mm-totals.needMm.min}:null;
    const deficitMm=complete?{min:Math.max(0,totals.needMm.min-budget.mm),max:Math.max(0,totals.needMm.max-budget.mm)}:null;
    const remainingM3=complete?{min:budget.m3-totals.needM3.max,max:budget.m3-totals.needM3.min}:null;
    const deficitM3=complete?{min:Math.max(0,totals.needM3.min-budget.m3),max:Math.max(0,totals.needM3.max-budget.m3)}:null;
    budgetComparison={period:'wholePlan',status,needMm:totals?.needMm??null,needM3:totals?.needM3??null,budgetMm:budget.mm,budgetM3:budget.m3,remainingMm,remainingM3,deficitMm,deficitM3};
    checks.push(makeCheck('water.plan-balance',status,status==='PASS'?'The whole-plan field-applied budget covers the sum of the modeled seasonal needs.':status==='FAIL'?'The whole-plan budget is below the modeled need range under complete modeled periods.':status==='WARNING'?'The whole-plan comparison is conditional because the model includes a range or conservative partial-period handling.':'The whole-plan comparison is unknown because at least one season is not calculable.',null,evidence,{needMm:budgetComparison.needMm,needM3:budgetComparison.needM3,budget,remainingMm,deficitMm},complete?[]:['completeWaterNeedsForAllSeasons'],'Resolve unknown seasons and confirm the field-applied budget basis before interpreting this total.'));
  }else{
    const statusesBySeason=seasons.map(item=>item.budgetStatus??'UNKNOWN');
    budgetComparison={period:'perSeason',status:deriveStatus(statusesBySeason),needMm:totals?.needMm??null,needM3:totals?.needM3??null,budgetMm:budget.mm,budgetM3:budget.m3,bySeason:seasons.map(item=>({season:item.season,status:item.budgetStatus,needMm:item.needMm,needM3:item.needM3,remainingMm:item.remainingMm,remainingM3:item.remainingM3,deficitMm:item.deficitMm,deficitM3:item.deficitM3}))};
  }
  const status=deriveStatus(checks.map(check=>check.status));
  return {
    status,budgetComparison,seasons,checks,areaHa:area,waterBudget:budget,
    scenarioLabel,period:climatePeriod?{...climatePeriod}:null,
    climateSource:climateData?.source??null,
    method:'FAO-56 Hargreaves-Samani ETo approximation; FAO-56 Kc × ETo; FAO simple effective-rainfall approximation on 30-day periods.',
    sources:{...WATER_SOURCES},
  };
}
