import {DEMO_FIELD_ID} from './demo-config.mjs';

export const sendJson=(res,status,body,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(body));};
export const readOnlyDenied=(res)=>{res.setHeader('Allow','GET');sendJson(res,405,{error:'This endpoint is read-only. Use GET.'});};
export const storageFailure=(res)=>sendJson(res,503,{error:'Local MongoDB is unavailable. Start MongoDB and run npm run db:import, then retry.'});
export const badQuery=(res,message)=>sendJson(res,400,{error:message});
export const notFound=(res,message)=>sendJson(res,404,{error:message});

export function validateClimateDailyRow(row,fieldId=DEMO_FIELD_ID){
 if(!row||typeof row!=='object')return 'climateDaily row';
 if(row.field_id!==fieldId)return 'climateDaily.field_id';
 if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))return 'climateDaily.date';
 if(row.time_standard!=='LST')return 'climateDaily.time_standard';
 for(const key of ['precip_mm','tmin_c','tmax_c','solar_kwh_m2_day'])if(row[key]!=null&&!Number.isFinite(row[key]))return `climateDaily.${key}`;
 return null;
}

export function validateClimateSeasonalRow(row,fieldId=DEMO_FIELD_ID){
 if(!row||typeof row!=='object')return 'climateSeasonal row';
 if(row.field_id!==fieldId)return 'climateSeasonal.field_id';
 if(row.time_standard!=='LST')return 'climateSeasonal.time_standard';
 if(typeof row.period_start!=='string'||typeof row.period_end!=='string')return 'climateSeasonal.period';
 if(row.source?.value_origin!=='calculated')return 'climateSeasonal.provenance';
 for(const key of ['precip_total_mm','hot_days_count'])if(row[key]!=null&&!Number.isFinite(row[key]))return `climateSeasonal.${key}`;
 return null;
}

export function validateCropProfile(row){
 if(!row||typeof row!=='object'||typeof row._id!=='string')return 'cropProfile._id';
 if(row.crop_id_status!=='proposed_for_engine_review')return 'cropProfile.status';
 for(const key of ['seasonal_water_use_mm_min','seasonal_water_use_mm_max'])if(row[key]!=null&&!Number.isFinite(row[key]))return `cropProfile.${key}`;
 if(!row.source?.product)return 'cropProfile.source';
 return null;
}

export function validateScenario(row,fieldId=DEMO_FIELD_ID){
 if(!row||typeof row!=='object')return 'scenario row';
 if(!['historical_event','what_if'].includes(row.scenario_type))return 'scenario.scenario_type';
 if(row.field_id!=null&&row.field_id!==fieldId)return 'scenario.field_id';
 if(row.scenario_type==='what_if'&&row.source?.value_origin!=='hypothetical')return 'scenario.what_if.provenance';
 return null;
}

export function validateDemoFieldPayload(data){
 if(data?.storage!=='MongoDB'||!data.field) return 'demo-field envelope';
 if(data.field._id!==DEMO_FIELD_ID) return 'field._id';
 if(!Array.isArray(data.climateDaily)||!Array.isArray(data.cropHistory)||!Array.isArray(data.soils)) return 'demo-field arrays';
 for(const row of data.climateDaily){const err=validateClimateDailyRow(row);if(err)return err;}
 return null;
}

export function engineCropCatalog(){
 return {
  wheat:{family:'grass',botanical:'Poaceae'},
  maize:{family:'grass',botanical:'Poaceae'},
  soy:{family:'legume',botanical:'Fabaceae'},
  chickpea:{family:'legume',botanical:'Fabaceae'},
  sunflower:{family:'aster',botanical:'Asteraceae'},
 };
}

export function cropCompatibilityMatrix(dbProfiles){
 const engine=engineCropCatalog();
 const proposals=Array.isArray(dbProfiles)?dbProfiles:[];
 const proposedById=new Map(proposals.map(p=>[p._id,p]));
 const rows=[
  {engineId:'wheat',dbId:'winter_wheat',botanical:'Poaceae',familyMatch:'partial',status:'proposed_not_activated',evidence:'DB profile is winter wheat interpretation of generic engine wheat; no Kc crosswalk.'},
  {engineId:'maize',dbId:'corn',botanical:'Zea mays / Poaceae',familyMatch:'yes',status:'proposed_not_activated',evidence:'Name alignment only; engine uses illustrative FAO Kc, not seasonal_water_use_mm range.'},
  {engineId:'soy',dbId:null,botanical:'Fabaceae',familyMatch:'n/a',status:'unmapped',evidence:'No crop_profiles slug for soybean.'},
  {engineId:'chickpea',dbId:'chickpea',botanical:'Fabaceae',familyMatch:'yes',status:'proposed_not_activated',evidence:'Trial-range water use in DB; engine legume checks only.'},
  {engineId:'sunflower',dbId:null,botanical:'Asteraceae',familyMatch:'n/a',status:'unmapped',evidence:'No crop_profiles record.'},
 ];
 for(const row of rows){
  const profile=row.dbId?proposedById.get(row.dbId):null;
  row.dbPresent=!!profile;
  row.dbStatus=profile?.crop_id_status??null;
 }
 for(const profile of proposals){
  if(['barley','alfalfa','sugar_beet','dry_bean','lentil'].includes(profile._id)){
   rows.push({engineId:null,dbId:profile._id,botanical:profile.plant_family??null,familyMatch:'n/a',status:'db_only',evidence:'Regional profile not in engine rotation catalog.',dbPresent:true,dbStatus:profile.crop_id_status});
  }
 }
 return rows;
}