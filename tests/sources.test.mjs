import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html=readFileSync(fileURLToPath(new URL('../sources.html',import.meta.url)),'utf8');
const i18n=readFileSync(fileURLToPath(new URL('../src/i18n.mjs',import.meta.url)),'utf8');

test('NASA POWER summaries describe historical climate data, not field observations',()=>{
  assert.match(i18n,/nasaHistorical:'Historical climate data \(not forecasts\)'/);
  assert.match(i18n,/nasaHistorical:'بيانات مناخية تاريخية \(وليست توقعات\)'/);
});

test('NASA POWER sampling is described as the actual vertex-average point, not a polygon centroid',()=>{
  assert.match(i18n,/nasaNote:'NASA POWER daily point query at the vertex-average point of your field\. Parameter source resolution varies; historical model-based values, not field instruments\.'/);
  assert.match(i18n,/nasaNote:'طلب نقطة يومي من NASA POWER عند متوسط إحداثيات زوايا الحقل\. تختلف دقة المصدر حسب المتغير؛ القيم تاريخية نموذجية وليست قياسات ميدانية\.'/);
  assert.match(html,/each parameter retains its original source spatial resolution/i);
  assert.match(html,/بيانات NASA POWER اليومية التاريخية عند متوسط إحداثيات زوايا الحقل/);
});

test('sources page documents the actual NASA POWER daily inputs and their scale',()=>{
  assert.match(html,/https:\/\/power\.larc\.nasa\.gov\/docs\/services\/api\/temporal\/daily\//);
  for(const parameter of ['PRECTOTCORR','T2M_MAX','T2M_MIN','ALLSKY_SFC_SW_DWN'])assert.ok(html.includes(parameter),`missing NASA POWER parameter ${parameter}`);
  assert.match(html,/POWER daily point values are gridded historical climate estimates/i);
  assert.match(html,/spatial sample, not a farm sensor or field-wide measurement/i);
});

test('sources page explains the documented water method and its scientific limits',()=>{
  assert.match(html,/FAO-56/i);
  assert.match(html,/Hargreaves[–-]Samani/i);
  assert.match(html,/Penman[–-]Monteith/i);
  assert.match(html,/ETc\s*=\s*Kc\s*[×x]\s*ETo/i);
  assert.match(html,/effective precipitation|effective rainfall/i);
  assert.match(html,/30[ -]day/i);
  assert.match(html,/not (?:a )?forecast/i);
  assert.match(html,/not (?:a )?locally validated|not locally calibrated/i);
});

test('sources page separates NASA observations, farmer inputs, and model assumptions',()=>{
  assert.match(html,/NASA POWER Daily Point API/);
  assert.match(html,/The farmer supplies the rotation, planting dates, field boundary and irrigation budget/);
  assert.match(html,/opt-in, illustrative FAO-56 crop-coefficient ranges/);
  assert.match(html,/The budget is treated as field-applied irrigation/i);
  assert.match(html,/does not measure actual water savings[\s\S]{0,240}groundwater availability/i);
});
