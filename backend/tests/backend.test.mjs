import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createDemoApi,createDemoStore} from '../scripts/mongo-demo.mjs';
const root=new URL('../.local/canonical/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const records={};
for(const entry of manifest.exports.filter(e=>e.target_collection))records[entry.target_collection]=(await readFile(new URL(entry.file,root),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const expected={fields:1,climate_daily:1096,climate_seasonal:2,crop_history:3,field_soils:26,crop_profiles:8,scenarios:2};
test('canonical counts, unique string IDs, references and asset hashes',async()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.length])),expected);
 const ids=new Set(records.fields.map(r=>r._id));
 for(const rows of Object.values(records)){assert.equal(new Set(rows.map(r=>r._id)).size,rows.length);for(const r of rows){assert.equal(typeof r._id,'string');if(r.field_id!=null)assert.ok(ids.has(r.field_id));}}
 for(const e of manifest.exports.filter(e=>e.sha256))assert.equal(createHash('sha256').update(await readFile(new URL(e.file,root))).digest('hex'),e.sha256);
});
test('canonical field, null budget, numeric types and full LST dates',()=>{
 const field=records.fields[0];assert.equal(field._id,manifest.field_id);assert.equal(field.area_ha,22.220372);assert.equal(field.irrigation_budget_mm,null);assert.equal(field.geometry.type,'Polygon');
 const dates=records.climate_daily.map(r=>r.date);assert.equal(new Set(dates).size,1096);assert.deepEqual(dates,[...dates].sort());assert.equal(dates[0],'2023-01-01');assert.equal(dates.at(-1),'2025-12-31');
 for(const r of records.climate_daily){assert.equal(r.time_standard,'LST');assert.equal(r.source.time_standard,'LST');assert.equal(r.source.response_header.time_standard,'LST');for(const key of ['precip_mm','tmin_c','tmax_c','solar_kwh_m2_day'])assert.ok(r[key]===null||Number.isFinite(r[key]));}
 for(const r of records.crop_history){assert.ok(Number.isInteger(r.year));assert.equal(r.crop_id,null);}
 for(const r of records.field_soils){assert.ok(Number.isFinite(r.depth_top_cm));assert.ok(r.depth_bottom_cm>r.depth_top_cm);}
});
async function request(store,method='GET'){
 const api=createDemoApi(store);const server=createServer((req,res)=>api(req,res,()=>{res.writeHead(404);res.end();}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/demo-field`,{method});return {status:response.status,allow:response.headers.get('allow'),body:await response.json()};}
 finally{await new Promise(resolve=>server.close(resolve));await api.close();}
}
test('GET transport contract with canonical fixture (not a MongoDB success test)',async()=>{
 const data={storage:'MongoDB',field:records.fields[0],climateDaily:records.climate_daily.filter(r=>r.date.startsWith('2025')),cropHistory:records.crop_history,soils:records.field_soils};
 const r=await request({load:async()=>data,close:async()=>{}});assert.equal(r.status,200);assert.deepEqual(Object.keys(r.body),['storage','field','climateDaily','cropHistory','soils']);assert.equal(r.body.climateDaily.length,365);assert.equal(r.body.cropHistory.length,3);assert.equal(r.body.soils.length,26);assert.equal(r.body.field.irrigation_budget_mm,null);
});
test('unsupported methods do not query storage',async()=>{for(const method of ['POST','PUT','DELETE','PATCH']){const r=await request({load:()=>assert.fail('must not load'),close:async()=>{}},method);assert.equal(r.status,405);assert.equal(r.allow,'GET');}});
test('missing field returns 404',async()=>{assert.equal((await request({load:async()=>null,close:async()=>{}})).status,404);});
test('storage failure is controlled and redacts internal error',async()=>{const r=await request({load:async()=>{throw Error('private connection details');},close:async()=>{}});assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('private'));});
