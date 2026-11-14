import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderBioFirewallInputs,renderBioFirewallResults} from '../src/biofirewall-view.mjs';
import {messages} from '../src/i18n.mjs';
import {emptyBioFirewall} from '../src/biofirewall.mjs';

test('English and Arabic BioFirewall controls expose field, hazard, evidence, and movement inputs',()=>{
 for(const lang of ['en','ar']){
  const html=renderBioFirewallInputs({lang,memory:emptyBioFirewall()});
  for(const id of ['bio-field-id','bio-hazard-field-id','bio-hazard-status','bio-equipment-id','bio-from-field-id','bio-to-field-id','bio-source-use','bio-moved-at','bio-cleaning-status','bio-cleaning-date','bio-notes','bio-demo'])assert.match(html,new RegExp(`id="${id}"`));
  assert.ok(html.includes(messages[lang].preflight.biofirewall.title.replaceAll('&','&amp;')));
  assert.ok(html.includes(messages[lang].preflight.biofirewall.statuses.confirmed));
 }
});

test('BioFirewall findings render status, evidence, missing items, action, and source',()=>{
 const html=renderBioFirewallResults({lang:'en',hasRun:true,checks:[{ruleId:'biofirewall.equipment-exposure',status:'WARNING',evidenceStatus:'potential-exposure',fieldId:'Field-B',sourceFieldId:'Field-A',equipmentId:'tractor-1',reason:'Potential exposure only.',explanation:'Potential exposure only.',missingInformation:['equipmentCleaningRecord'],nextStep:'Verify with an expert.',sources:[{title:'Source',url:'https://example.org/rule'}]}]});
 for(const fragment of ['WARNING','Field-B','Field-A','tractor-1',messages.en.preflight.explanations['biofirewall.equipment-exposure'].WARNING,messages.en.preflight.missingLabels.equipmentCleaningRecord,'Verify the source report','https://example.org/rule'])assert.ok(html.includes(fragment),fragment);
});

test('reported-hazard findings label the affected field as the source field, not the target',()=>{
 const html=renderBioFirewallResults({lang:'en',hasRun:true,checks:[{ruleId:'biofirewall.reported-hazard',status:'WARNING',evidenceStatus:'confirmed',fieldId:'Field-A',reason:'Farmer report.',explanation:'Farmer report.',missingInformation:[],nextStep:'Verify.',sources:[{title:'Source',url:'https://example.org/rule'}]}]});
 assert.ok(html.includes('Field with reported hazard: Field-A'));
 assert.ok(!html.includes('Target field identifier: Field-A'));
});

test('BioFirewall localization structures remain key-consistent across English and Arabic',()=>{
 const en=messages.en.preflight.biofirewall,ar=messages.ar.preflight.biofirewall;
 assert.deepEqual(Object.keys(en).sort(),Object.keys(ar).sort());
 assert.deepEqual(Object.keys(en.statuses).sort(),Object.keys(ar.statuses).sort());
 for(const id of ['biofirewall.reported-hazard','biofirewall.equipment-exposure']){
  assert.ok(messages.en.preflight.checkLabels[id]);assert.ok(messages.ar.preflight.checkLabels[id]);
  assert.ok(messages.en.preflight.explanations[id]);assert.ok(messages.ar.preflight.explanations[id]);
  assert.ok(messages.en.preflight.nextSteps[id]);assert.ok(messages.ar.preflight.nextSteps[id]);
 }
});


test('BioFirewall empty results prompt a Preflight run',()=>{
 const html=renderBioFirewallResults({lang:'ar',hasRun:false,checks:[]});
 assert.ok(html.includes(messages.ar.preflight.biofirewall.runFindings));
});
