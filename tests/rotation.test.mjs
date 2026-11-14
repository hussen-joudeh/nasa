import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRotation, compareRotations, crops, readSaved} from '../src/domain.mjs';
import {parsePowerDaily} from '../src/nasa-power.mjs';
const a=['wheat','maize','wheat'], b=['wheat','soy','sunflower'];
const check=(e,id,season=null)=>e.checks.find(c=>c.id===id&&c.season===season);
// Illustrative observations, not a measured field or scientific validation.
const power=(rain=4)=>parsePowerDaily({header:{start:'20250101',end:'20251231'},properties:{parameter:{PRECTOTCORR:{20250101:rain},T2M_MAX:{20250101:20},T2M_MIN:{20250101:8}}},parameters:{PRECTOTCORR:{units:'mm/day'},T2M_MAX:{units:'C'},T2M_MIN:{units:'C'}}});
test('family warnings distinguish the default sequences without a winner',()=>{
 const result=compareRotations([a,b]);
 assert.equal(check(result.evaluations[0],'family',2).result,'WARNING');
 assert.equal(check(result.evaluations[1],'family',2).result,'PASS');
 assert.equal(check(result.evaluations[0],'diversity').result,'WARNING');
 assert.equal(result.winner,null);assert.ok(result.differences.some(d=>d.id==='family'));
 assert.deepEqual(result,compareRotations([a,b]));
});
test('legume classification is explicit, not an inferred fertilizer credit',()=>{
 for(const id of ['soy','chickpea'])assert.equal(crops[id].legume,true);
 for(const id of ['wheat','maize','sunflower'])assert.equal(crops[id].legume,false);
 assert.equal(check(evaluateRotation(b),'legume').result,'PASS');
 assert.equal(check(evaluateRotation(a),'legume').result,'WARNING');
 assert.equal(check(evaluateRotation(b),'compatibility').result,'UNKNOWN');
});
test('invalid sequences fail the input contract; missing evidence never passes',()=>{
 for(const r of [null,[],['wheat','soy'],['wheat','alien','soy'],['constructor','soy','wheat']]){
  const e=evaluateRotation(r);assert.equal(check(e,'sequence').result,'FAIL');assert.equal(e.status,'FAIL');
 }
 const e=evaluateRotation(b);assert.equal(check(e,'sequence').result,'PASS');assert.equal(e.status,'UNKNOWN');
 for(const c of e.checks){assert.ok(c.explanation);assert.ok(c.source);assert.ok(c.inputs);assert.ok(Array.isArray(c.missing));}
});
test('previous crop is optional, validated and compared with season one',()=>{
 assert.equal(check(evaluateRotation(b),'history',1).result,'UNKNOWN');
 assert.equal(check(evaluateRotation(b,{previousCrop:'alien'}),'history',1).result,'UNKNOWN');
 assert.equal(check(evaluateRotation(b,{previousCrop:'maize'}),'history',1).result,'WARNING');
 assert.equal(check(evaluateRotation(b,{previousCrop:'chickpea'}),'history',1).result,'PASS');
});
test('normalized POWER affects evidence and missing inputs, never unsupported suitability',()=>{
 const absent=check(evaluateRotation(b),'climate',1);
 const dry=check(evaluateRotation(b,{},power(4)),'climate',1);
 const wet=check(evaluateRotation(b,{},power(400)),'climate',1);
 assert.ok(absent.missing.includes('precipitation'));
 assert.ok(!dry.missing.includes('precipitation'));
 assert.equal(dry.inputs.observations.precipitation.value,4);
 assert.equal(wet.inputs.observations.precipitation.value,400);
 assert.equal(dry.result,'UNKNOWN');assert.equal(wet.result,'UNKNOWN');
 assert.ok(dry.missing.includes('cropRequirements'));assert.equal(dry.inputs.observations.precipitation.validDays,1);
 const bad=power();bad.channels.precipitation.unit='inch/day';
 assert.ok(check(evaluateRotation(b,{},bad),'climate',1).missing.includes('precipitation'));
 assert.deepEqual(evaluateRotation(b,{},power()).checks.filter(c=>c.id!=='climate'),evaluateRotation(b).checks.filter(c=>c.id!=='climate'));
});
test('legacy two-rotation plans migrate to three distinct strategies',()=>{
 const p={version:1,polygon:[[35,31],[35.01,31],[35.01,31.01]],rotations:[a,b],country:'PSE',scenario:'ssp245',period:'2040-2059'};
 const restored=readSaved(JSON.stringify(p));
 assert.equal(restored.rotations.length,3);
 assert.deepEqual(restored.rotations[2],['chickpea','wheat','soy']);
});
test('v1 plans remain unchanged, optional history roundtrips, evaluation is pure',()=>{
 const p={version:1,polygon:[[35,31],[35.01,31],[35.01,31.01]],rotations:[a,b,['chickpea','wheat','soy']],country:'PSE',scenario:'ssp245',period:'2040-2059'};
 const before=JSON.stringify(p);compareRotations(p.rotations);assert.equal(JSON.stringify(p),before);assert.deepEqual(readSaved(before),p);
 assert.deepEqual(readSaved(JSON.stringify({...p,previousCrop:'soy'})).previousCrop,'soy');
 assert.throws(()=>readSaved(JSON.stringify({...p,previousCrop:'alien'})));
 assert.throws(()=>readSaved(JSON.stringify({...p,rotations:[['constructor','soy','wheat'],b]})));
});
