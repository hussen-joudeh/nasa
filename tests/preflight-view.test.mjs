import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages} from '../src/i18n.mjs';
import {renderPreflightPanel,renderDecisionBreakpoint} from '../src/preflight-view.mjs';
import {runPreflight} from '../src/preflight.mjs';
import {compareRotations} from '../src/domain.mjs';
import {renderDecisionComparison} from '../src/rotation-view.mjs';

const inputs={waterBudget:{amount:'2500',unit:'m3',period:'perSeason'},plantingDates:['2025-02-01','',''],illustrativeCropSettings:false,effectiveRainfallSlopeConfirmed:false};

test('Preflight controls expose budget units, applicability period, three dates, and no required-field false gate',()=>{
  const html=renderPreflightPanel({lang:'en',inputs,areaHa:2,period:{startIso:'2025-01-01',endIso:'2025-12-31'}});
  assert.match(html,/>Run Preflight</);
  assert.match(html,/m³ for the whole field/);
  assert.match(html,/All three seasons combined/);
  assert.match(html,/id="planting-date-3"/);
  assert.match(html,/2025-12-31/);
  assert.doesNotMatch(html,/\brequired\b/);
});

test('Arabic Preflight labels, UNKNOWN state, and explanations are localized',()=>{
  const evaluation=runPreflight(['wheat','maize','wheat'],{},null);
  const html=renderPreflightPanel({lang:'ar',inputs,evaluations:[evaluation]});
  assert.match(html,/شغّل الفحص المسبق/);
  assert.match(html,/غير معروف/);
  assert.match(html,/ميزانية الري أو وحدتها أو فترتها أو مساحة الحقل ناقصة/);
  assert.match(html,/class="preflight-season-note"/);
  assert.match(html,/class="preflight-season-missing"/);
  assert.doesNotMatch(html,/الميزانية تغطي الخطة كاملة/);
  assert.doesNotMatch(html,/The irrigation budget, unit, period/);
});

test('Preflight renders BioFirewall findings once outside water/rotation checks in both locales',()=>{
 const biofirewall={fieldId:'Field-B',reportedHazard:{fieldId:'Field-A',hazardId:'clubroot',hazardName:'',evidenceStatus:'confirmed',recordedDate:'2025-04-01',notes:'Illustrative only'},equipmentMovements:[{id:'demo',equipmentId:'tractor-1',fromFieldId:'Field-A',toFieldId:'Field-B',sourceUseConfirmed:true,movedAt:'2025-04-02',cleaningStatus:'not-recorded',cleaningDate:'',notes:''}]};
 const evaluation=runPreflight(['wheat','maize','wheat'],{biofirewall},null);
 const en=renderPreflightPanel({lang:'en',inputs,evaluations:[evaluation,evaluation,evaluation],biofirewall});
 assert.match(en,/id="bio-demo"/);assert.match(en,/WARNING/);assert.match(en,/Field-A/);assert.match(en,/Field-B/);assert.match(en,/tractor-1/);assert.match(en,/potential equipment-mediated soil exposure only/i);assert.match(en,/gov\.mb\.ca\/agriculture\/crops\/plant-diseases\/clubroot-of-canola\.html/);
 assert.equal((en.match(/biofirewall-check/g)??[]).length,2);
 assert.doesNotMatch(en,/class="preflight-check"[^>]*>[^]*?biofirewall\.equipment-exposure/);
 const ar=renderPreflightPanel({lang:'ar',inputs,evaluations:[evaluation],biofirewall});
 assert.match(ar,/الحاجز الحيوي/);assert.match(ar,/تعرّض محتمل — لا يعني الإصابة/);assert.doesNotMatch(ar,/Entered records support a potential/);
});


test('Preflight evaluation labels remain distinct when the comparison grows to three strategies',()=>{
  const rotations=[['wheat','maize','wheat'],['wheat','soy','sunflower'],['soy','maize','sunflower']];
  const evaluations=rotations.map(rotation=>runPreflight(rotation,{},null));
  const html=renderPreflightPanel({lang:'en',inputs,evaluations});
  assert.match(html,/<h4>Rotation C<\/h4>/);
  assert.equal((html.match(/class="preflight-evaluation"/g)??[]).length,3);
});

test('rotation comparison table keeps three strategy headers distinct',()=>{
  const rotations=[['wheat','maize','wheat'],['wheat','soy','sunflower'],['soy','maize','sunflower']];
  const html=renderDecisionComparison(compareRotations(rotations,{},null),'en');
  assert.match(html,/<th scope="col">Rotation C<\/th>/);
});

test('per-season budgets do not imply a misleading plan-total balance',()=>{
  const evaluation=runPreflight(['wheat','maize','wheat'],{waterBudget:{amount:1000,unit:'m3',period:'perSeason'}},null);
  const html=renderPreflightPanel({lang:'en',inputs,evaluations:[evaluation]});
  const summary=html.match(/<div class="preflight-summary">([\s\S]*?)<\/div>/)?.[1]??'';
  assert.match(summary,/Per-season budget comparisons are shown in each crop card; no single plan-total balance is reported\./);
  assert.doesNotMatch(summary,/No meaningful budget balance is available until the requirement is calculable\./);
});

test('both language dictionaries provide all core labels and neutral UNKNOWN',()=>{
  for(const lang of ['en','ar']){
    assert.ok(messages[lang].preflight.title);
    assert.ok(messages[lang].preflight.methodDescription);
    assert.ok(messages[lang].preflight.assumptionLabels.hargreavesApproximation);
    assert.equal(messages[lang].decision.UNKNOWN,lang==='en'?'UNKNOWN':'غير معروف');
  }
});

test('Decision Breakpoint panel prioritizes sensitivity and shows no more than three findings',()=>{
  const sensitive={id:'sensitive',rotationIndex:0,ruleId:'water.balance',season:1,classification:'DECISION-SENSITIVE',testedRange:{min:0,max:1200.1234567890123,unit:'m3',period:'perSeason',derived:true},threshold:{mm:100.12345678901234,m3:1000.1234567890123,inclusive:true},statuses:{atMin:'FAIL',atMax:'PASS',atThreshold:'PASS'},transitions:[],missingInformation:[],explanation:'Rule-level change.',verifyAction:'Confirm delivered water.'};
  const findings=[sensitive,...Array.from({length:4},(_,index)=>({id:`unknown-${index}`,rotationIndex:index,ruleId:'rotation.compatibility',season:null,classification:'INSUFFICIENT EVIDENCE',testedRange:null,threshold:null,statuses:null,transitions:[],missingInformation:['localConstraints'],explanation:'Cannot assess.',verifyAction:'Check local constraints.'}))];
  const html=renderDecisionBreakpoint({lang:'en',findings,observedChanges:null});
  assert.match(html,/Before You Plant — What Should You Verify\?/);
  assert.equal((html.match(/class="breakpoint-finding"/g)??[]).length,3);
  assert.ok(html.indexOf('DECISION-SENSITIVE')<html.indexOf('INSUFFICIENT EVIDENCE'));
  assert.match(html,/m³/);
  assert.match(html,/1000\.1234567890123/);
  assert.match(html,/per season/i);
  assert.doesNotMatch(html,/undefined/);
});

test('Decision Breakpoint reports verified rule changes without claiming plan acceptance',()=>{
  const html=renderDecisionBreakpoint({lang:'en',findings:[],observedChanges:{changed:[{rotationIndex:0,ruleId:'water.balance',season:1,before:'UNKNOWN',after:'PASS'}],unchangedCount:18,changedInputs:['waterBudget']}});
  assert.match(html,/UNKNOWN/);
  assert.match(html,/PASS/);
  assert.match(html,/18/);
  assert.match(html,/complete agricultural plan/i);
});

test('Arabic Decision Breakpoint is localized and identifies unsupported information',()=>{
  const html=renderDecisionBreakpoint({lang:'ar',findings:[{id:'x',rotationIndex:0,ruleId:'rotation.compatibility',season:null,classification:'INSUFFICIENT EVIDENCE',testedRange:null,threshold:null,statuses:null,transitions:[],missingInformation:['localConstraints'],explanation:'The current rules cannot evaluate this.',verifyAction:'Verify local constraints.'}],observedChanges:null});
  assert.match(html,/قبل ما تزرع — شو لازم تتأكد منه؟/);
  assert.match(html,/ما في أدلة كافية/);
  assert.match(html,/قيود محلية موثقة/);
  assert.doesNotMatch(html,/The current rules cannot evaluate/);
});
