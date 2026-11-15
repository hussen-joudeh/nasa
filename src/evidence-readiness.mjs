const DEMO_FIELD_ID='scottsbluff_gering_ne:csb1825:311825012125041';
const sourceOk=r=>typeof r?.source?.product==='string'&&typeof r.source.spatial_scope==='string';
const number=v=>v===null||Number.isFinite(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function validateSupplement(kind,data){
 if(data?.storage!=='MongoDB')throw Error('storage');
 const key={seasonal:'climateSeasonal',profiles:'cropProfiles',compatibility:'compatibility',scenarios:'scenarios'}[kind];
 if(!key||!Array.isArray(data[key]))throw Error('shape');
 if(['seasonal','scenarios'].includes(kind)&&data.fieldId!==DEMO_FIELD_ID)throw Error('field');
 for(const r of data[key]){
  if(kind==='seasonal'&&(!sourceOk(r)||r.field_id!==DEMO_FIELD_ID||!date(r.period_start)||!date(r.period_end)||r.period_start>r.period_end||r.time_standard!=='LST'||r.source.value_origin!=='calculated'||!['precip_total_mm','hot_days_count','hot_day_threshold_c','valid_days','expected_days'].every(k=>number(r[k]))))throw Error('seasonal');
  if(kind==='profiles'&&(!sourceOk(r)||typeof r._id!=='string'||typeof r.name!=='string'||typeof r.plant_family!=='string'||r.crop_id_status!=='proposed_for_engine_review'||!number(r.seasonal_water_use_mm_min)||!number(r.seasonal_water_use_mm_max)))throw Error('profile');
  if(kind==='compatibility'&&(!['proposed_not_activated','unmapped','db_only'].includes(r.status)||!(r.engineId===null||['wheat','maize','soy','sunflower','chickpea'].includes(r.engineId))||!(r.dbId===null||typeof r.dbId==='string')||typeof r.evidence!=='string'))throw Error('compatibility');
  if(kind==='scenarios'&&(!sourceOk(r)||!['historical_event','what_if'].includes(r.scenario_type)))throw Error('scenario');
 }
 if(data[key].length===0)throw Error('empty-evidence');
 if(kind==='compatibility'&&['wheat','maize','soy','chickpea','sunflower'].some(id=>data[key].filter(r=>r.engineId===id).length!==1))throw Error('missing-or-duplicate-engine-crop');
 if(kind==='seasonal'&&data.semantics?.notForecast!==true)throw Error('forecast');
 return data;
}
export function seasonalConsistency(row,daily){
 const days=daily.filter(d=>d.field_id===row.field_id&&d.time_standard===row.time_standard&&d.date>=row.period_start&&d.date<=row.period_end);
 const expected=(Date.parse(row.period_end)-Date.parse(row.period_start))/86400000+1;
 if(days.length!==expected||new Set(days.map(d=>d.date)).size!==expected||days.some(d=>!Number.isFinite(d.precip_mm)||!Number.isFinite(d.tmax_c)))return 'NOT_COMPARABLE';
 return Math.abs(days.reduce((s,d)=>s+d.precip_mm,0)-row.precip_total_mm)<0.011&&days.filter(d=>d.tmax_c>=row.hot_day_threshold_c).length===row.hot_days_count?'CONSISTENT':'MISMATCH';
}
export function evidenceReadiness(evidence,supplement={},used=false){
 supplement=supplement??{};
 const items=[];
 const add=(r,kind,role,units,consumer,reason)=>items.push({id:r._id??kind,kind,role,source:r.source??r.boundary_provenance??null,spatial:r.source?.spatial_scope??r.geometry??null,temporal:r.source?.period??r.source?.survey_revision_date??r.year??null,units,missing:Object.keys(r).filter(k=>r[k]==null),verification:r.approval_status??r.crop_id_status??r.source?.value_origin??'not_recorded',consumer,reason,record:r});
 add(evidence.field,'boundary',used?'DIRECT_INPUT':'REQUIRES_CONFIRMATION','WGS84 / ha',used?'areaHa → Preflight / Water Truth':null,'proposed_geometry');
 for(const r of evidence.climateDaily)add(r,'daily',used?'DIRECT_INPUT':'CONTEXT_ONLY','mm/day; C; kWh/m²/day → MJ/m²/day',used?'parsePowerDaily → rotation climate context; Tmax/Tmin/precipitation → Water Truth':null,'historical_grid');
 for(const r of evidence.cropHistory){const valid=sourceOk(r)&&Number.isInteger(r.year)&&typeof r.crop_label==='string';add(r,'history',valid?'REQUIRES_CONFIRMATION':'UNSUPPORTED','USDA CDL class',null,valid?'classification_not_confirmation':'malformed');}
 for(const r of evidence.soils){const valid=sourceOk(r)&&Number.isFinite(r.depth_top_cm)&&Number.isFinite(r.depth_bottom_cm)&&r.depth_bottom_cm>r.depth_top_cm&&number(r.available_water_capacity_mm_per_mm);add(r,'soil',valid?'CONTEXT_ONLY':'UNSUPPORTED','depth cm; AWC mm/mm',null,valid?'no_soil_rule':'malformed');}
 for(const r of supplement.seasonal?.climateSeasonal??[])add(r,'seasonal','CONTEXT_ONLY',r.source.units,null,'historical_summary');
 for(const r of supplement.profiles?.cropProfiles??[])add(r,'profile','REQUIRES_CONFIRMATION','seasonal water use mm',null,'range_not_kc');
 for(const r of supplement.compatibility?.compatibility??[])add(r,'mapping',r.status==='unmapped'?'UNSUPPORTED':'REQUIRES_CONFIRMATION',null,null,r.status==='unmapped'?'missing_profile':'range_not_kc');
 return items;
}
