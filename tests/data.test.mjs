import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, readSaved, validatePolygon, parseWeather, parseClimate, decodeTerrain } from '../src/domain.mjs';
import {validateBioFirewall} from '../src/biofirewall.mjs';
import {messages} from '../src/i18n.mjs';
test('all English messages have Arabic equivalents',()=>assert.deepEqual(Object.keys(messages.en).sort(),Object.keys(messages.ar).sort()));
test('terrain accepts real sea-level pixels but refuses voids and impossible heights',()=>{assert.equal(decodeTerrain([128,0,0,255]),0);assert.equal(decodeTerrain([128,100,128,255]),100.5);assert.throws(()=>decodeTerrain([0,0,0,255]));assert.throws(()=>decodeTerrain([128,0,0,0]));});
test('data client refuses HTTP errors and malformed JSON and respects abort',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('{}',{status:429});await assert.rejects(fetchJson('https://example.test'),/HTTP 429/);
 globalThis.fetch=async()=>new Response('not json');await assert.rejects(fetchJson('https://example.test'));
 globalThis.fetch=async()=>new Response('{"error":true}');await assert.rejects(fetchJson('https://example.test'),/service/);
 const controller=new AbortController();controller.abort();globalThis.fetch=async(_u,{signal})=>{signal.throwIfAborted();};await assert.rejects(fetchJson('https://example.test',controller.signal));
 }finally{globalThis.fetch=original;}
});
test('plan roundtrip validates user inputs and refuses malformed plans',()=>{
 const plan={version:1,polygon:[[35,31],[35.01,31],[35.01,31.01]],rotations:[['wheat','soy','maize'],['soy','wheat','soy'],['chickpea','wheat','soy']],country:'PSE',scenario:'ssp245',period:'2040-2059'};
 assert.deepEqual(readSaved(JSON.stringify(plan)),plan);
 for(const bad of [{...plan,version:2},{...plan,country:'XXX'},{...plan,rotations:[['unknown']]},{...plan,polygon:[[0,0],[0,0],[1,1]]}])assert.throws(()=>readSaved(JSON.stringify(bad)));
});
test('saved BioFirewall memory validates optional hazard and movement evidence while legacy plans stay valid',()=>{
 const plan={version:1,polygon:[[35,31],[35.01,31],[35.01,31.01]],rotations:[['wheat','soy','maize'],['soy','wheat','soy'],['chickpea','wheat','soy']],country:'PSE',scenario:'ssp245',period:'2040-2059'};
 const memory={fieldId:'Field-B',reportedHazard:{fieldId:'Field-A',hazardId:'clubroot',hazardName:'',evidenceStatus:'confirmed',recordedDate:'2025-04-01',notes:''},equipmentMovements:[{id:'move-1',equipmentId:'tractor-1',fromFieldId:'Field-A',toFieldId:'Field-B',sourceUseConfirmed:true,movedAt:'2025-04-02',cleaningStatus:'not-recorded',cleaningDate:'',notes:''}]};
 assert.deepEqual(readSaved(JSON.stringify(plan)),plan);
 assert.deepEqual(readSaved(JSON.stringify({...plan,biofirewall:memory})).biofirewall,memory);
 assert.equal(validateBioFirewall(memory),true);
 assert.throws(()=>readSaved(JSON.stringify({...plan,biofirewall:{...memory,equipmentMovements:[{...memory.equipmentMovements[0],sourceUseConfirmed:'yes'}]}})));
 assert.throws(()=>validateBioFirewall({...memory,reportedHazard:{...memory.reportedHazard,recordedDate:'2025-13-01'}}));
});
test('polygon limits reject global extents, collinear and nonnumeric points',()=>{for(const p of [[[0,0],[3,0],[0,3]],[[0,0],[.1,.1],[.2,.2]],[[0,0],[null,1],[1,0]]])assert.throws(()=>validatePolygon(p));});
test('unexpected weather units and climate sentinels are unavailable',()=>{assert.equal(parseWeather({current:{time:'x',temperature_2m:70},current_units:{temperature_2m:'°F'}}).temperature,null);assert.throws(()=>parseClimate({data:{tas:{USA:{'2040-07':-999}}}},'USA'));});
