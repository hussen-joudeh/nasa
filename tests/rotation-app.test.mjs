import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as domain from '../src/domain.mjs';
import * as view from '../src/rotation-view.mjs';
import {runPreflight} from '../src/preflight.mjs';
import * as biofirewall from '../src/biofirewall.mjs';
import {renderPreflightPanel as renderPreflightPanelHtml} from '../src/preflight-view.mjs';
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
function harness(){
 const elements=new Map();
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',classList:{toggle(){}},textContent:''});return elements.get(id);},querySelectorAll(){return [];}};
 const context=vm.createContext({DEMO_FIELD_ID,...explorer,...domain,...view,...biofirewall,...farmerInputs,...farmerInputView,...decisionTrace,...decisionSnapshot,...decisionSnapshotValidity,...decisionTraceView,runPreflight,renderPreflightPanelHtml,messages,document,Intl,URL,console});
 vm.runInContext(source,context);return {context,elements,run:code=>vm.runInContext(code,context)};
}
test('app renders decisions and comparison, persists history and clears climate evidence',()=>{
 const h=harness();h.run('renderRotations()');
 assert.match(h.elements.get('rotation-grid').innerHTML,/Climate suitability/);
 assert.match(h.elements.get('rotation-comparison').innerHTML,/<table/);
 h.run("farmerInputs={fieldScope:null,previousCrop:{cropId:'soy',confirmed:true,provenance:'farmer_assertion'}}");assert.equal(h.run('plan().previousCrop'),'soy');
 h.run('nasaClimate=null; renderNasaClimate()');
 assert.match(h.elements.get('rotation-grid').innerHTML,/Usable precipitation observations/);
});
test('restoring an old v1 plan clears optional history instead of inheriting it',()=>{
 const h=harness();h.run("farmerInputs={fieldScope:null,previousCrop:{cropId:'soy',confirmed:true,provenance:'farmer_assertion'}}; render=()=>{}; restore({rotations:[['wheat','soy','maize'],['wheat','maize','wheat']],country:'USA',scenario:'ssp245',period:'2040-2059',polygon:[[0,0],[0.01,0],[0.01,0.01]]})");
 assert.equal(h.run('farmerInputs.previousCrop.confirmed'),false);
 assert.equal(h.run("biofirewallMemory.fieldId"),'');
 assert.equal(h.run("biofirewallMemory.equipmentMovements.length"),0);
});
test('changing the field clears the previous fields cropping history',()=>{
 const h=harness();h.run("farmerInputs={fieldScope:null,previousCrop:{cropId:'soy',confirmed:true,provenance:'farmer_assertion'}};renderField=()=>{};renderWeather=()=>{};updateDraw=()=>{};setPolygon([[0,0],[0.01,0],[0.01,0.01]])");
 assert.equal(h.run('farmerInputs.previousCrop.cropId'),null);
});
