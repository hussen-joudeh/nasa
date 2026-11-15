import {validateSupplement} from './evidence-readiness.mjs';
import {parsePowerDaily,fetchPowerClimate} from './nasa-power.mjs';
import {fetchJson,validatePolygon} from './domain.mjs';
export const DEMO_FIELD_ID='scottsbluff_gering_ne:csb1825:311825012125041';
export function adaptDemoEvidence(data){
 const field=data?.field;
 if(data?.storage!=='MongoDB'||field?._id!==DEMO_FIELD_ID||field.field_id!==DEMO_FIELD_ID||field.approval_status!=='proposed'||!Number.isFinite(field.area_ha)||field.area_ha<=0)throw Error('demo-field');
 const ring=field.geometry?.type==='Polygon'&&field.geometry.coordinates?.length===1?field.geometry.coordinates[0]:null;
 if(!ring||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))throw Error('demo-geometry');
 const polygon=validatePolygon(ring.slice(0,-1).map(p=>[...p]));
 if(field.centroid?.type!=='Point'||field.centroid.coordinates?.length!==2||!field.centroid.coordinates.every(Number.isFinite))throw Error('demo-centroid');
 const rows=data.climateDaily;
 if(!Array.isArray(rows)||rows.length!==365)throw Error('demo-days');
 for(const name of ['cropHistory','soils'])if(!Array.isArray(data[name])||data[name].length!==(name==='cropHistory'?3:26)||data[name].some(r=>r.field_id!==DEMO_FIELD_ID))throw Error('demo-reference');
 const parameter={PRECTOTCORR:{},T2M_MIN:{},T2M_MAX:{},ALLSKY_SFC_SW_DWN:{}};
 rows.forEach((r,i)=>{
 const expected=new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10);
 if(r.field_id!==DEMO_FIELD_ID||r.date!==expected||r.time_standard!=='LST'||r.source?.time_standard!=='LST'||!r.source?.product?.includes('NASA POWER'))throw Error('demo-date-source');
 for(const [key,code,factor] of [['precip_mm','PRECTOTCORR',1],['tmin_c','T2M_MIN',1],['tmax_c','T2M_MAX',1],['solar_kwh_m2_day','ALLSKY_SFC_SW_DWN',3.6]]){
 const value=r[key];if(value!=null&&!Number.isFinite(value))throw Error('demo-measurement');parameter[code][r.date.replaceAll('-','')]=value==null?null:value*factor;
 }
 });
 const source=rows[0].source;
 const climate=parsePowerDaily({header:{...source.response_header,start:'20250101',end:'20251231',time_standard:'LST'},geometry:source.grid?.response_point_geometry??field.centroid,parameters:Object.fromEntries(Object.keys(parameter).map(k=>[k,{units:k==='ALLSKY_SFC_SW_DWN'?'MJ/m^2/day':k==='PRECTOTCORR'?'mm/day':'C'}])),properties:{parameter}});
 return {field,polygon,evidence:data,climate:{...climate,storage:'MongoDB',fieldId:DEMO_FIELD_ID,archiveSource:source,retrieved:new Date().toISOString(),url:'/api/demo-field',query:{longitude:field.centroid.coordinates[0],latitude:field.centroid.coordinates[1],start:'20250101',end:'20251231'}}};
}
export async function fetchDemoEvidence(){return adaptDemoEvidence(await fetchJson('/api/demo-field'));}
export async function fetchDemoSupplement(){
 const result={errors:{}};
 await Promise.all(Object.entries({seasonal:'/api/demo-field/climate-seasonal',scenarios:'/api/demo-field/scenarios',profiles:'/api/crop-profiles',compatibility:'/api/crop-compatibility'}).map(async([kind,url])=>{try{result[kind]=validateSupplement(kind,await fetchJson(url));}catch{result[kind]=null;result.errors[kind]='unavailable_or_invalid';}}));
 return result;
}
export async function loadFieldClimate(selection,polygon,lon,lat,{demo=fetchDemoEvidence,live=fetchPowerClimate}={}){
 if(!selection)return live(lon,lat);
 if(selection.field._id!==DEMO_FIELD_ID||JSON.stringify(selection.polygon)!==JSON.stringify(polygon))throw Error('demo-selection-mismatch');
 const fresh=await demo();if(JSON.stringify(fresh.polygon)!==JSON.stringify(polygon))throw Error('demo-boundary-changed');return fresh.climate;
}
