import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPowerCoordinates, defaultPowerPeriod, parsePowerDaily, planningSnapshot, powerDailyUrl, fetchPowerClimate } from '../src/nasa-power.mjs';

const fixture = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-119.95, 36.78, 195] },
  header: { start: '20230101', end: '20230105', fill_value: -999, time_standard: 'LST', title: 'NASA/POWER Source Native Resolution Daily Data', sources: ['MERRA2'] },
  parameters: {
    PRECTOTCORR: { units: 'mm/day', longname: 'Precipitation Corrected' },
    T2M_MAX: { units: 'C', longname: 'Temperature at 2 Meters Maximum' },
    T2M_MIN: { units: 'C', longname: 'Temperature at 2 Meters Minimum' },
    ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day', longname: 'All Sky Surface Shortwave Downward Irradiance' },
  },
  properties: {
    parameter: {
      PRECTOTCORR: { 20230101: 4, 20230102: 0, 20230103: -999, 20230104: 2.5, 20230105: 1.5 },
      T2M_MAX: { 20230101: 12, 20230102: 14, 20230103: -999, 20230104: 15, 20230105: 16 },
      T2M_MIN: { 20230101: 2, 20230102: 3, 20230103: -999, 20230104: 4, 20230105: 5 },
      ALLSKY_SFC_SW_DWN: { 20230101: 8, 20230102: 9, 20230103: -999, 20230104: 10, 20230105: 11 },
    },
  },
};

test('zero coordinates and zero daily observations are real values, not missing',()=>{
 assert.doesNotThrow(()=>assertPowerCoordinates(0,0));
 const parsed=parsePowerDaily({...fixture,properties:{parameter:{PRECTOTCORR:{20230101:0},T2M_MAX:{20230101:0},T2M_MIN:{20230101:0}}}});
 assert.equal(parsed.planning.precipitationAnnualMm,0);
 assert.equal(parsed.planning.temperatureMeanMaxC,0);
 assert.equal(parsed.channels.precipitation.summary.validDays,1);
});

test('power url validates coordinates and period', () => {
  const url = powerDailyUrl(36.78, -119.95, '20230101', '20231231');
  assert.match(url, /power\.larc\.nasa\.gov\/api\/temporal\/daily\/point/);
  assert.match(url, /parameters=PRECTOTCORR%2CT2M_MAX%2CT2M_MIN%2CALLSKY_SFC_SW_DWN/);
  assert.match(url, /longitude=-119\.95/);
  assert.match(url, /latitude=36\.78/);
  assert.throws(() => assertPowerCoordinates(95, 0));
  assert.throws(() => powerDailyUrl(36.78, -119.95, '20231231', '20230101'));
});

test('parse fills, units, summaries, and planning snapshot', () => {
  const parsed = parsePowerDaily(fixture);
  assert.equal(parsed.status, 'ok');
  assert.equal(parsed.channels.precipitation.unit, 'mm/day');
  assert.equal(parsed.planning.precipitationAnnualMm, 8);
  assert.equal(parsed.planning.temperatureMeanMaxC, 14.25);
  assert.equal(parsed.planning.solarRadiationMeanDailyMj, 9.5);
  assert.equal(parsed.missing.length, 0);
  assert.throws(() => parsePowerDaily({ properties: { parameter: {} } }));
  assert.throws(() => parsePowerDaily({ ...fixture, properties: { parameter: { PRECTOTCORR: { 20230101: -999 } } } }));
  const partial = parsePowerDaily({ ...fixture, properties: { parameter: { ...fixture.properties.parameter, ALLSKY_SFC_SW_DWN: { 20230101: -999, 20230102: -999, 20230103: -999, 20230104: -999, 20230105: -999 } } } });
  assert.equal(planningSnapshot(partial).solarRadiationMeanDailyMj, null);
  assert.equal(partial.status, 'partial');
});

test('default period uses the prior completed calendar year', () => {
  assert.deepEqual(defaultPowerPeriod(new Date('2026-11-14T00:00:00Z')), { start: '20250101', end: '20251231', year: 2025 });
});

test('fetch client surfaces HTTP failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(fetchPowerClimate(-119.95, 36.78, { start: '20230101', end: '20230105' }), /HTTP 503/);
  } finally {
    globalThis.fetch = original;
  }
});
