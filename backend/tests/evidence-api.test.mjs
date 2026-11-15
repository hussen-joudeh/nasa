import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createDemoApi,createDemoStore} from '../scripts/mongo-demo.mjs';
import {cropCompatibilityMatrix,validateClimateSeasonalRow,validateCropProfile} from '../scripts/evidence-validate.mjs';
const root=new URL('../.local/canonical/',import.meta.url);
const load=async(name)=>(await readFile(new URL(`${name}.jsonl`,root),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const records={fields:(await load('fields')),climate_daily:await load('climate_daily'),climate_seasonal:await load('climate_seasonal'),crop_history:await load('crop_history'),field_soils:await load('field_soils'),crop_profiles:await load('crop_profiles'),scenarios:await load('scenarios')};
const fixtureCounts={fields:1,climate_daily:1096,climate_seasonal:2,crop_history:3,field_soils:26,crop_profiles:8,scenarios:2};
const fixtureStore=()=>({
  ping:async()=>{const collections=Object.entries(fixtureCounts).map(([collection,count])=>({collection,count}));return {storage:'MongoDB',http:true,ready:true,mongodb:{reachable:true,database:'fieldshift_demo'},evidence:{imported:true,collectionsMatch:true,collections},analysis:{ready:true,climateDaily2025:365},collections,fieldId:records.fields[0]._id};},
  load:async()=>({storage:'MongoDB',field:records.fields[0],climateDaily:records.climate_daily.filter(r=>r.date.startsWith('2025')),cropHistory:records.crop_history,soils:records.field_soils}),
  loadClimateSeasonal:async()=>({storage:'MongoDB',fieldId:records.fields[0]._id,climateSeasonal:records.climate_seasonal,semantics:{kind:'historical_growing_season_summary',timeStandard:'LST',notForecast:true}}),
  loadScenarios:async()=>({storage:'MongoDB',fieldId:records.fields[0]._id,scenarios:records.scenarios,semantics:{historicalVsHypothetical:'scenario_type distinguishes documented events from what_if records'}}),
  loadCropProfiles:async()=>{const compatibility=cropCompatibilityMatrix(records.crop_profiles);return {storage:'MongoDB',cropProfiles:records.crop_profiles,compatibility,semantics:{waterUseRanges:'evidence_only_not_engine_kc',status:'proposed_for_engine_review'}};},
  close:async()=>{},
});
async function get(path,store=fixtureStore(),method='GET'){
 const api=createDemoApi(store);const server=createServer((req,res)=>api(req,res,()=>{res.writeHead(404);res.end();}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method});return {status:response.status,allow:response.headers.get('allow'),body:await response.json()};}
 finally{await new Promise(resolve=>server.close(resolve));await api.close();}
}
test('climate seasonal and crop profile contracts reject bad LST or status',()=>{
 const seasonal=records.climate_seasonal[0];
 assert.equal(validateClimateSeasonalRow(seasonal),null);
 assert.equal(validateClimateSeasonalRow({...seasonal,time_standard:'UTC'}),'climateSeasonal.time_standard');
 const profile=records.crop_profiles.find(p=>p._id==='chickpea');
 assert.equal(validateCropProfile(profile),null);
 assert.equal(validateCropProfile({...profile,crop_id_status:'active'}),'cropProfile.status');
});
test('crop compatibility lists proposed mappings without activating crosswalk',()=>{
 const matrix=cropCompatibilityMatrix(records.crop_profiles);
 const chickpea=matrix.find(r=>r.engineId==='chickpea');
 assert.equal(chickpea.status,'proposed_not_activated');
 assert.equal(chickpea.dbId,'chickpea');
 const soy=matrix.find(r=>r.engineId==='soy');
 assert.equal(soy.status,'unmapped');
 assert.ok(matrix.some(r=>r.dbId==='corn'&&r.status==='proposed_not_activated'));
});
test('GET /api/health and supplemental evidence routes',async()=>{
 assert.equal((await get('/api/health')).status,200);
 const seasonal=await get('/api/demo-field/climate-seasonal');
 assert.equal(seasonal.status,200);assert.equal(seasonal.body.climateSeasonal.length,2);assert.equal(seasonal.body.semantics.notForecast,true);
 const scenarios=await get('/api/demo-field/scenarios');
 assert.equal(scenarios.status,200);assert.ok(scenarios.body.scenarios.some(s=>s.scenario_type==='historical_event'));
 const profiles=await get('/api/crop-profiles');
 assert.equal(profiles.status,200);assert.equal(profiles.body.cropProfiles.length,8);assert.match(profiles.body.semantics.waterUseRanges,/not_engine_kc/);
 const compat=await get('/api/crop-compatibility');
 assert.equal(compat.status,200);assert.ok(compat.body.note.includes('not active'));
});
test('malformed supplemental evidence returns 422 without fabrication',async()=>{
 const store=fixtureStore();
 const bad=structuredClone(records.climate_seasonal[0]);bad.time_standard='UTC';
 store.loadClimateSeasonal=async()=>{const err=validateClimateSeasonalRow(bad);if(err)throw Error(`malformed:${err}`);return {storage:'MongoDB',fieldId:records.fields[0]._id,climateSeasonal:[bad],semantics:{}};};
 assert.equal((await get('/api/demo-field/climate-seasonal',store)).status,422);
});
test('rejects unsupported methods and query parameters',async()=>{
 assert.equal((await get('/api/demo-field/climate-seasonal',fixtureStore(),'POST')).status,405);
 assert.equal((await get('/api/demo-field/climate-seasonal?year=2023')).status,400);
});