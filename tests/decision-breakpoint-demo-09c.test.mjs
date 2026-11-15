import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptDemoEvidence } from '../src/demo-evidence.mjs';
import { areaHa, defaultRotations } from '../src/domain.mjs';
import { runPreflight } from '../src/preflight.mjs';
import { analyzeDecisionSensitivity } from '../src/decision-breakpoint.mjs';
import {renderSeasonWaterReason} from '../src/preflight-view.mjs';

const root = new URL('../backend/.local/canonical/', import.meta.url);
const load = async (name) =>
  (await readFile(new URL(`${name}.jsonl`, root), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);

async function scottsbluffContext() {
  const field = (await load('fields'))[0];
  const climateDaily = (await load('climate_daily')).filter((r) => r.date.startsWith('2025'));
  const selected = adaptDemoEvidence({
    storage: 'MongoDB',
    field,
    climateDaily,
    cropHistory: await load('crop_history'),
    soils: await load('field_soils'),
  });
  const polygon = selected.polygon;
  return {
    climate: selected.climate,
    context: {
      polygon,
      areaHa: areaHa(polygon),
      waterBudget: { amount: '', unit: 'mm', period: 'perSeason' },
      plantingDates: ['2025-04-20', '2025-05-01', '2025-05-15'],
      illustrativeCropSettings: true,
      effectiveRainfallSlopeConfirmed: true,
      previousCrop: null,
    },
    rotations: [['wheat', 'soy', 'wheat']],
  };
}

function balanceStatus(evaluation, season = 1) {
  return evaluation.checks.find((c) => c.ruleId === 'water.balance' && c.season === season)?.status;
}

test('Scottsbluff demo yields decision-sensitive season-1 water.balance threshold', async () => {
  const { climate, context, rotations } = await scottsbluffContext();
  const sensitivity = analyzeDecisionSensitivity(rotations, context, climate, {
    testedBudgetRange: { min: 0, max: 500_000, unit: 'm3', period: 'perSeason' },
  });
  const finding = sensitivity.findings.find(
    (f) => f.rotationIndex === 0 && f.season === 1 && f.ruleId === 'water.balance',
  );
  assert.equal(finding?.classification, 'DECISION-SENSITIVE');
  assert.ok(finding.threshold.mm > 600);
  assert.ok(finding.threshold.m3 > 100_000);

  const below = runPreflight(rotations[0], { ...context, waterBudget: { amount: '622', unit: 'mm', period: 'perSeason' } }, climate);
  const at = runPreflight(rotations[0], { ...context, waterBudget: { amount: '623.86', unit: 'mm', period: 'perSeason' } }, climate);
  const above = runPreflight(rotations[0], { ...context, waterBudget: { amount: '624', unit: 'mm', period: 'perSeason' } }, climate);

  assert.equal(balanceStatus(below), 'WARNING');
  assert.equal(balanceStatus(at), 'PASS');
  assert.equal(balanceStatus(above), 'PASS');
  assert.equal(below.status, 'UNKNOWN');
  assert.ok(below.checks.some((c) => c.status === 'UNKNOWN'));
});

test('default Scottsbluff plans split at 600 mm for reference season 2', async () => {
  const { climate, context } = await scottsbluffContext();
  const evaluate = amount => analyzeDecisionSensitivity(defaultRotations, {
    ...context, waterBudget: { amount, unit: 'mm', period: 'perSeason' },
  }, climate).evaluations;
  const at600 = evaluate('600');
  assert.deepEqual(at600.map(e => balanceStatus(e, 2)), ['PASS', 'WARNING', 'WARNING']);
  assert.deepEqual(evaluate('620').map(e => balanceStatus(e, 2)), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(evaluate('600'), at600);
  assert.ok(at600[0].water.seasons[1].needMm.max < 600);
  assert.ok(at600[1].water.seasons[1].needMm.min > 600);
  assert.ok(at600[2].water.seasons[0].missingInformation.includes('cropGrowthStageCalendar'));
  assert.ok(at600.every(e => e.status === 'UNKNOWN'));
});

test('row explanations distinguish actual model-range uncertainty from partial rainfall periods',async()=>{
 const {climate,context}=await scottsbluffContext();
 for(const [index,amount,partial] of [[0,'585',false],[1,'600',true]]){
  const evaluation=runPreflight(defaultRotations[index],{...context,waterBudget:{amount,unit:'mm',period:'perSeason'}},climate);
  const check=evaluation.checks.find(item=>item.ruleId==='water.balance'&&item.season===2);
  assert.equal(check.status,'WARNING');assert.equal(check.inputs.partialBlock,partial);
  for(const lang of ['en','ar']){
   const html=renderSeasonWaterReason({evaluation,lang});
   assert.ok(html.includes(partial?(lang==='en'?'Conditional estimate: partial rainfall period.':'تقدير مشروط: فترة أمطار غير مكتملة.'):(lang==='en'?'Conditional estimate: model uncertainty.':'تقدير مشروط: عدم يقين في النموذج.')));
   assert.ok(html.includes(lang==='en'?'Why this water check?':'لماذا هذه النتيجة؟'));
   if(!partial)assert.doesNotMatch(html,/The final rainfall period is incomplete/);
  }
 }
});
