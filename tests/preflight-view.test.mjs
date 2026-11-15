import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages} from '../src/i18n.mjs';
import {renderPreflightPanel,renderPreflightResultsSection,renderDecisionBreakpoint,renderBudgetConfirmation,renderSeasonWaterChart} from '../src/preflight-view.mjs';
import {JSDOM} from 'jsdom';
import {cubicMetresToMillimetres} from '../src/water-truth.mjs';
import {formatDepthMm} from '../src/display-format.mjs';
import {runPreflight} from '../src/preflight.mjs';
import {compareRotations} from '../src/domain.mjs';
import {renderDecisionComparison} from '../src/rotation-view.mjs';

const inputs={waterBudget:{amount:'2500',unit:'m3',period:'perSeason'},plantingDates:['2025-02-01','',''],illustrativeCropSettings:false,effectiveRainfallSlopeConfirmed:false};

test('dashboard groups shared missing inputs once and scopes checks, seasons and sensitivity to the selected plan',()=>{
 const evaluations=Array.from({length:3},()=>runPreflight(['wheat','maize','wheat'],{},null));
 const findings=evaluations.map((_,rotationIndex)=>({rotationIndex,ruleId:'water.balance',season:2,classification:'INSUFFICIENT EVIDENCE',missingInformation:['seasonPlantingDate']}));
 const changed=findings.map(item=>({...item,before:'UNKNOWN',after:'PASS'}));
 for(const lang of ['en','ar']){
  const html=renderPreflightResultsSection({lang,evaluations,selectedRotation:1,dashboard:true,breakpoint:{findings,observedChanges:{changed,unchangedCount:42,changedInputs:['waterBudget']}}});
  const document=new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll('.preflight-evaluation').length,1);
  assert.equal(document.querySelector('.preflight-evaluation').dataset.rotation,'1');
  assert.equal(document.querySelectorAll('.preflight-check-groups').length,1);
  assert.equal(document.querySelector('.preflight-check-groups').dataset.rotation,'1');
  assert.equal(document.querySelectorAll('.breakpoint-finding').length,1);
  assert.equal(document.querySelectorAll('.breakpoint-changes li').length,1);
  const missing=document.querySelectorAll('[data-missing-input="seasonPlantingDate"]');
  assert.equal(missing.length,1);
  assert.match(missing[0].textContent,/A.*B.*C/);
  assert.equal(document.querySelectorAll('.preflight-season-missing').length,0);
  assert.equal(document.querySelectorAll('.preflight-check-store:not([hidden])').length,0);
 }
});

test('Season 2 chart uses a shared zero-based scale and keeps blank and zero budgets distinct',()=>{
 const rows=[300,600,450].map((need,index)=>({index,season:{crop:'maize',needMm:{max:need},remainingMm:{min:700-need}}}));
 for(const lang of ['en','ar']){
  const blank=renderSeasonWaterChart({rows,lang});
  assert.doesNotMatch(blank,/class="chart-budget-line"/);
  assert.ok(blank.includes(lang==='en'?'Enter a seasonal irrigation budget':'أدخل ميزانية ري لكل موسم'));
  const withBudget=renderSeasonWaterChart({rows,budget:700,lang});
  assert.ok(withBudget.includes('width:'+300/700*100+'%'));
  assert.ok(withBudget.includes('width:'+600/700*100+'%'));
  assert.ok(withBudget.includes('<data value="0">'));
  assert.ok(withBudget.includes('inset-inline-start:100%'));
  assert.match(renderSeasonWaterChart({rows,budget:0,lang}),/class="chart-budget-line"/);
  assert.doesNotMatch(renderSeasonWaterChart({rows:[{index:0}],lang}),/NaN|Infinity|undefined/);
 }
});

test('budget confirmation preserves volume and scope and uses the existing depth conversion',()=>{
 const areaHa=22.187560600766858;
 for(const lang of ['en','ar']){
  const html=renderBudgetConfirmation({lang,budget:{amount:'600',unit:'m3',period:'perSeason'},areaHa});
  assert.ok(html.includes('600 m³'));
  assert.ok(html.includes(formatDepthMm(cubicMetresToMillimetres(600,areaHa),lang)+' mm'));
  assert.ok(html.includes(lang==='en'?'per crop season':'لكل موسم محصول'));
  assert.ok(renderBudgetConfirmation({lang,budget:{amount:'600',unit:'mm',period:'wholePlan'},areaHa}).includes(lang==='en'?'not allocated separately to Season 2':'لا يُخصص بشكل منفصل للموسم الثاني'));
 }
 assert.match(renderBudgetConfirmation({budget:{amount:'',unit:'mm',period:'perSeason'},areaHa}),/No irrigation budget entered/);
 assert.match(renderBudgetConfirmation({budget:{amount:'0',unit:'mm',period:'perSeason'},areaHa}),/>0 mm</);
 assert.match(renderBudgetConfirmation({budget:{amount:'600',unit:'m3',period:'perSeason'}}),/Select a valid field boundary/);
 assert.match(renderBudgetConfirmation({budget:{amount:'-1',unit:'mm',period:'perSeason'},areaHa}),/class="error"/);
});

test('Preflight controls expose budget units, applicability period, three dates, and no required-field false gate',()=>{
  const html=renderPreflightPanel({lang:'en',inputs,areaHa:2,period:{startIso:'2025-01-01',endIso:'2025-12-31'}});
  assert.match(html,/>Compare plans</);
  assert.match(html,/m³ for the whole field/);
  assert.match(html,/All three seasons combined/);
  assert.match(html,/id="planting-date-3"/);
  assert.match(html,/2025-12-31/);
  assert.doesNotMatch(html,/\brequired\b/);
});

test('Preflight season cards do not show escaped bdi markup in balance text',()=>{
  const evaluation=runPreflight(['wheat','maize','wheat'],{waterBudget:{amount:'622',unit:'mm',period:'perSeason'},illustrativeCropSettings:true,effectiveRainfallSlopeConfirmed:true,plantingDates:['2025-04-20','2025-05-01','2025-05-15']},null);
  const html=renderPreflightPanel({lang:'en',inputs:{waterBudget:{amount:'622',unit:'mm',period:'perSeason'},illustrativeCropSettings:true,effectiveRainfallSlopeConfirmed:true,plantingDates:['2025-04-20','2025-05-01','2025-05-15']},evaluations:[evaluation]});
  assert.doesNotMatch(html,/&lt;bdi&gt;/);
  assert.match(html,/class="preflight-season"/);
});

test('Arabic Preflight labels, UNKNOWN state, and explanations are localized',()=>{
  const evaluation=runPreflight(['wheat','maize','wheat'],{},null);
  const html=renderPreflightPanel({lang:'ar',inputs,evaluations:[evaluation]});
  assert.match(html,/قارن الخطط/);
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

test('Decision Breakpoint threshold axis uses engine numbers without hardcoding demo constants',()=>{
  const sensitive={id:'sensitive',rotationIndex:0,ruleId:'water.balance',season:1,classification:'DECISION-SENSITIVE',testedRange:{min:0,max:1200.1234567890123,unit:'m3',period:'perSeason',derived:true},threshold:{mm:623.8591556593612,m3:138419.12822535323,inclusive:true},statuses:{atMin:'WARNING',atMax:'PASS',atThreshold:'PASS'},transitions:[],missingInformation:[],baselineStatus:'WARNING',variable:'waterBudget'};
  const evaluation={status:'UNKNOWN',checks:[{ruleId:'water.balance',season:1,status:'WARNING'}],water:{seasons:[{season:1,status:'UNKNOWN',budgetStatus:'WARNING',needMm:{min:614.9,max:623.86},needM3:{min:136432,max:138419}}]}};
  const html=renderDecisionBreakpoint({lang:'en',findings:[sensitive],hasRun:true,evaluation,waterBudget:{amount:'622',unit:'mm',period:'perSeason'},areaHa:22.19,period:{startIso:'2025-01-01',endIso:'2025-12-31'},inputs:{illustrativeCropSettings:true,effectiveRainfallSlopeConfirmed:true}});
  assert.match(html,/class="breakpoint-axis"/);
  assert.match(html,/breakpoint-marker--threshold/);
  assert.match(html,/breakpoint-marker--budget/);
  assert.match(html,/623\.86/);
  assert.doesNotMatch(html,/623\.8591556593612/);
  assert.match(html,/data-status="UNKNOWN"/);
  assert.match(html,/data-status="WARNING"/);
});

test('Decision Breakpoint panel prioritizes sensitivity and shows no more than three findings',()=>{
  const sensitive={id:'sensitive',rotationIndex:0,ruleId:'water.balance',season:1,classification:'DECISION-SENSITIVE',testedRange:{min:0,max:1200.1234567890123,unit:'m3',period:'perSeason',derived:true},threshold:{mm:100.12345678901234,m3:1000.1234567890123,inclusive:true},statuses:{atMin:'FAIL',atMax:'PASS',atThreshold:'PASS'},transitions:[],missingInformation:[],explanation:'Rule-level change.',verifyAction:'Confirm delivered water.'};
  const findings=[sensitive,...Array.from({length:4},(_,index)=>({id:`unknown-${index}`,rotationIndex:index,ruleId:'rotation.compatibility',season:null,classification:'INSUFFICIENT EVIDENCE',testedRange:null,threshold:null,statuses:null,transitions:[],missingInformation:['localConstraints'],explanation:'Cannot assess.',verifyAction:'Check local constraints.'}))];
  const html=renderDecisionBreakpoint({lang:'en',findings,observedChanges:null});
  assert.match(html,/Before You Plant — What Should You Verify\?/);
  assert.equal((html.match(/class="breakpoint-finding"/g)??[]).length,3);
  assert.ok(html.indexOf('DECISION-SENSITIVE')<html.indexOf('INSUFFICIENT EVIDENCE'));
  assert.match(html,/m³/);
  assert.match(html,/1,000/);
  assert.doesNotMatch(html,/1000\.1234567890123/);
  assert.doesNotMatch(html,/623\.8591556593612/);
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
