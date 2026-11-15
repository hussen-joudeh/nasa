import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as domain from '../src/domain.mjs';
import * as view from '../src/rotation-view.mjs';
import {runPreflight} from '../src/preflight.mjs';
import {analyzeDecisionSensitivity} from '../src/decision-breakpoint.mjs';
import * as biofirewall from '../src/biofirewall.mjs';
import {renderPreflightPanel as renderPreflightPanelHtml,renderStalePreflightResults,renderPreflightResultsSection} from '../src/preflight-view.mjs';
import {messages} from '../src/i18n.mjs';
import * as explorer from '../src/map-explorer.mjs';
import * as farmerInputs from '../src/farmer-inputs.mjs';
import * as farmerInputView from '../src/farmer-input-view.mjs';
import * as decisionTrace from '../src/decision-trace.mjs';
import * as decisionSnapshot from '../src/decision-snapshot.mjs';
import * as decisionSnapshotValidity from '../src/decision-snapshot-validity.mjs';
import * as decisionTraceView from '../src/decision-trace-view.mjs';
import { DEMO_FIELD_ID } from '../src/demo-evidence.mjs';

const source=(await readFile(new URL('../src/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/render\(\);\s*$/,'');
function climate(){
  const tmax={},tmin={},precipitation={};
  for(let date=new Date('2025-01-01T00:00:00Z');date<=new Date('2025-12-31T00:00:00Z');date.setUTCDate(date.getUTCDate()+1)){
    const key=date.toISOString().slice(0,10).replaceAll('-','');tmax[key]=20;tmin[key]=10;precipitation[key]=0;
  }
  const summary=(values,stat)=>({validDays:365,daysInSeries:365,[stat]:stat==='sum'?0:Object.values(values).reduce((a,b)=>a+b,0)/365});
  const channel=(code,unit,daily,stat)=>({code,unit,available:true,daily,summary:summary(daily,stat)});
  return {source:'NASA POWER',dataset:'NASA/POWER Daily',timeStandard:'LST',coordinates:{latitude:36.78,longitude:-119.95},period:{start:'20250101',end:'20251231',startIso:'2025-01-01',endIso:'2025-12-31'},channels:{temperatureMax:channel('T2M_MAX','C',tmax,'mean'),temperatureMin:channel('T2M_MIN','C',tmin,'mean'),precipitation:channel('PRECTOTCORR','mm/day',precipitation,'sum')}};
}
function harness(){
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',checked:false,classList:{toggle(){}},textContent:''});return elements.get(id);},querySelectorAll(){return [];}};
  const context=vm.createContext({DEMO_FIELD_ID,...explorer,...domain,...view,...biofirewall,...farmerInputs,...farmerInputView,...decisionTrace,...decisionSnapshot,...decisionSnapshotValidity,...decisionTraceView,runPreflight,analyzeDecisionSensitivity,renderPreflightPanelHtml,renderStalePreflightResults,renderPreflightResultsSection,messages,document,Intl,URL,console});
  vm.runInContext(source,context);
  return {context,elements,run:code=>vm.runInContext(code,context)};
}

test('BioFirewall demo evaluates a potential exposure and preserves an unvalidated cleaning update',()=>{
  const h=harness();
  h.run("polygon=[[-119.95,36.78],[-119.9484,36.78],[-119.9484,36.7813],[-119.95,36.7813]];renderPreflightPanel()");
  assert.equal(typeof h.elements.get('bio-demo').onclick,'function');
  h.elements.get('bio-demo').onclick();
  assert.equal(h.run("preflightEvaluations[0].checks.find(x=>x.ruleId==='biofirewall.equipment-exposure').status"),'WARNING');
  assert.equal(h.run("preflightEvaluations[0].checks.find(x=>x.ruleId==='biofirewall.equipment-exposure').evidenceStatus"),'potential-exposure');
  assert.equal(h.run("plan().biofirewall.equipmentMovements[0].cleaningStatus"),'not-recorded');
  h.elements.get('bio-field-id').value='Field-B';h.elements.get('bio-hazard-field-id').value='Field-A';h.elements.get('bio-hazard-id').value='clubroot';h.elements.get('bio-hazard-status').value='confirmed';h.elements.get('bio-recorded-date').value='2025-04-01';
  h.elements.get('bio-equipment-id').value='shared-tractor-1';h.elements.get('bio-from-field-id').value='Field-A';h.elements.get('bio-to-field-id').value='Field-B';h.elements.get('bio-source-use').value='true';h.elements.get('bio-moved-at').value='2025-04-02';h.elements.get('bio-cleaning-status').value='documented-unvalidated';
  h.elements.get('bio-cleaning-status').oninput();
  assert.match(h.elements.get('biofirewall-results').innerHTML,/Run Preflight to evaluate BioFirewall records/);
  h.elements.get('preflight-form').onsubmit({preventDefault(){}});
  const check=h.run("preflightEvaluations[0].checks.find(x=>x.ruleId==='biofirewall.equipment-exposure')");
  assert.equal(check.status,'WARNING');
  assert.equal(check.cleaningStatus,'documented-unvalidated');
  assert.ok(check.missingInformation.includes('validatedCleaningProtocol'));
  const saved=domain.readSaved(JSON.stringify(h.run('plan()')));
  assert.equal(saved.biofirewall.equipmentMovements[0].cleaningStatus,'documented-unvalidated');
  h.run(`render=()=>{};restore(${JSON.stringify(saved)})`);
  assert.equal(h.run("biofirewallMemory.equipmentMovements[0].cleaningStatus"),'documented-unvalidated');
});


test('Decision Breakpoint demo still analyzes real Preflight water changes',()=>{
  const h=harness();
  h.context.testClimate=climate();
  h.run("polygon=[[-119.95,36.78],[-119.9484,36.78],[-119.9484,36.7813],[-119.95,36.7813]];nasaClimate=testClimate;renderPreflightPanel()");
  const demo=h.elements.get('decision-breakpoint-demo');
  assert.equal(typeof demo.onclick,'function');
  demo.onclick();
  assert.equal(h.run("preflightInputs.waterBudget.amount"),'');
  assert.equal(h.run("preflightEvaluations[0].checks.find(x=>x.ruleId==='water.balance'&&x.season===1).status"),'UNKNOWN');
  assert.equal(h.run("preflightBreakpoints.findings.find(x=>x.rotationIndex===0&&x.season===1&&x.ruleId==='water.balance').classification"),'DECISION-SENSITIVE');
  const threshold=h.run("preflightBreakpoints.findings.find(x=>x.rotationIndex===0&&x.season===1&&x.ruleId==='water.balance').threshold.m3");
  for(let i=1;i<=3;i++)h.elements.get(`planting-date-${i}`).value=h.run(`preflightInputs.plantingDates[${i-1}]`);
  h.elements.get('illustrative-crop-settings').checked=true;
  h.elements.get('effective-rainfall-slope-confirmed').checked=true;
  h.elements.get('water-budget-amount').value=String(threshold);
  h.elements.get('water-budget-unit').value='m3';
  h.elements.get('water-budget-period').value='perSeason';
  h.elements.get('preflight-form').onsubmit({preventDefault(){}});
  const changed=h.run('preflightBreakpoints.observedChanges');
  assert.ok(changed.changed.some(x=>x.ruleId==='water.balance'&&x.season===1&&x.before==='UNKNOWN'&&x.after==='PASS'));
  assert.deepEqual(Array.from(changed.changedInputs),['waterBudget']);
  assert.ok(changed.changed.every(x=>['water.balance','water.budget'].includes(x.ruleId)));
  assert.notEqual(h.run('preflightEvaluations[0].status'),'PASS');
  assert.match(h.elements.get('preflight-root').innerHTML,/What changed after the inputs were updated/);
  assert.match(h.elements.get('preflight-root').innerHTML,/complete agricultural plan/);
  const restored=domain.readSaved(JSON.stringify(h.run('plan()')));
  assert.deepEqual(restored.preflightInputs.waterBudget,{amount:String(threshold),unit:'m3',period:'perSeason'});
});
