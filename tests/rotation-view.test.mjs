import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRotations,defaultRotations,crops} from '../src/domain.mjs';
import {renderDecisionChecks,renderDecisionComparison,renderPlanLane,renderFamilyLegend,planFacts,planChange} from '../src/rotation-view.mjs';
import {messages} from '../src/i18n.mjs';
const a=['wheat','maize','wheat'],b=['wheat','soy','sunflower'];
const comparison=compareRotations([a,b]);
const defaultComparison=compareRotations(defaultRotations);
test('both languages render explanations, missing inputs, evidence and source links',()=>{
 for(const lang of ['en','ar']){
  const html=renderDecisionChecks(comparison.evaluations[0],lang);
  assert.ok(html.includes(messages[lang].decision.UNKNOWN));
  assert.ok(html.includes(messages[lang].decision.reasons.climateUnknown));
  assert.ok(html.includes(messages[lang].decision.missing.previousCrop));
  assert.match(html,/https:\/\/extension.umn.edu/);
  assert.ok(!html.includes('undefined'));
  const table=renderDecisionComparison(comparison,lang);
  assert.match(table,/<table/);assert.ok(table.includes(messages[lang].decision.insufficientEvidence));
 }
});
test('decision renderer escapes evidence and does not claim suitability',()=>{
 const e=structuredClone(comparison.evaluations[0]);
 e.checks[0].explanation='<script>bad()</script>';
 e.checks[0].inputs.sequence=['<img onerror=bad()>'];
 const html=renderDecisionChecks(e,'en');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
 assert.match(html,/UNKNOWN/);
});
test('plans A B C render three seasons with catalog crops and family context',()=>{
 for(let i=0;i<3;i++){
  const evaluation=defaultComparison.evaluations[i],lane=renderPlanLane(evaluation,i,'en');
  assert.match(lane,new RegExp('data-plan="'+String.fromCharCode(65+i)+'"'));
  assert.equal((lane.match(/class="lane-season"/g)||[]).length,3);
  assert.equal((lane.match(/<select[^>]+data-season="/g)||[]).length,3);
  for(let s=0;s<3;s++){
   const crop=evaluation.sequence[s];
   assert.ok(lane.includes('id="rotation-'+i+'-'+s+'"'));
   assert.ok(lane.includes('value="'+crop+'" selected'));
   assert.ok(lane.includes('data-family="'+crops[crop].family+'"'));
   assert.ok(lane.includes(crops[crop].en));
  }
 }
});
test('repeated-family transitions are marked on the lane track',()=>{
 const lane=renderPlanLane(defaultComparison.evaluations[0],0,'en');
 assert.match(lane,/data-repeat="true"/);
 assert.ok(lane.includes(messages.en.decision.repeatsPrev));
 assert.match(lane,/data-result="WARNING"/);
});
test('comparison Differs and Same reflect engine facts across three plans',()=>{
 const table=renderDecisionComparison(defaultComparison,'en');
 const facts=defaultComparison.evaluations.map(planFacts);
 const differs=key=>new Set(facts.map(f=>f[key])).size>1;
 for(const key of ['families','repeats','legumes']){
  const label=messages.en[key];
  const chunk=table.split(label)[1]?.split('</tr>')[0]??'';
  assert.ok(chunk,`missing ${key} row`);
  if(differs(key))assert.ok(chunk.includes(messages.en.decision.differs));
  else assert.ok(chunk.includes(messages.en.decision.sameAll));
 }
 assert.ok(table.includes('data-differs="true"'));
 assert.ok(table.includes('data-differs="false"'));
});
test('UNKNOWN and advisory warnings stay visible in lanes and comparison',()=>{
 const open=renderDecisionComparison(defaultComparison,'en');
 assert.ok(open.includes(messages.en.decision.notAssessed));
 assert.match(open,/data-status="UNKNOWN"/);
 const warnLane=renderPlanLane(defaultComparison.evaluations[0],0,'en');
 assert.match(warnLane,/class="lane-warnings"/);
 assert.match(warnLane,/data-status="WARNING"/);
 assert.match(warnLane,/data-status="UNKNOWN"/);
 assert.match(warnLane,new RegExp(messages.en.decision.unresolvedLabel));
});
test('plan change after a crop edit is reflected in the live lane note',()=>{
 const rotations=defaultRotations.map(s=>[...s]);
 const before=compareRotations(rotations).evaluations[0];
 rotations[0][1]='soy';
 const after=compareRotations(rotations).evaluations[0];
 const change={index:0,items:planChange(before,after)};
 assert.ok(change.items.length,change.items);
 const lane=renderPlanLane(after,0,'en',change);
 assert.match(lane,/data-changed="true"/);
 assert.ok(lane.includes(messages.en.decision.updated));
 assert.match(lane,/lane-change/);
 assert.ok(change.items.some(item=>item.key==='legumes'&&item.to===1));
});
test('Arabic copy names three rotation strategies including plan C',()=>{
 assert.ok(renderPlanLane(defaultComparison.evaluations[0],0,'ar').includes(messages.ar.rotationA));
 assert.ok(renderPlanLane(defaultComparison.evaluations[1],1,'ar').includes(messages.ar.rotationB));
 const c=renderPlanLane(defaultComparison.evaluations[2],2,'ar');
 assert.ok(c.includes(messages.ar.rotationLabelPrefix));
 assert.ok(c.includes('ج'));
 assert.match(renderDecisionComparison(defaultComparison,'ar'),new RegExp(messages.ar.decision.compareTitle));
});
test('family legend and evidence blocks keep stable keys for open-state preservation',()=>{
 const legend=renderFamilyLegend('en');
 assert.match(legend,/data-family="/);
 assert.ok(legend.includes(messages.en.decision.families[crops.wheat.botanicalFamily]));
 const lane=renderPlanLane(defaultComparison.evaluations[1],1,'en');
 assert.ok(lane.includes('data-k="evidence-B"'));
 assert.ok(lane.includes('data-k="check-B-0"'));
 assert.match(lane,/class="plan-evidence"/);
 const comp=renderDecisionComparison(defaultComparison,'en');
 assert.ok(comp.includes('data-k="comparison-detail"'));
});