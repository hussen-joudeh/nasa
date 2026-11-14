import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRotations} from '../src/domain.mjs';
import {renderDecisionChecks,renderDecisionComparison} from '../src/rotation-view.mjs';
import {messages} from '../src/i18n.mjs';
const comparison=compareRotations([['wheat','maize','wheat'],['wheat','soy','sunflower']]);
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
