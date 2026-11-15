import { fetchJson } from './domain.mjs';

export const POWER_DAILY_PARAMETERS = ['PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'ALLSKY_SFC_SW_DWN'];

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function assertPowerCoordinates(latitude, longitude) {
  if (finite(latitude) === null || finite(longitude) === null || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) throw Error('coordinates');
}

export function defaultPowerPeriod(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear() - 1;
  return { start: `${year}0101`, end: `${year}1231`, year };
}

export function formatPowerDate(yyyymmdd) {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function powerDailyUrl(latitude, longitude, start, end) {
  assertPowerCoordinates(latitude, longitude);
  if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || start > end) throw Error('period');
  const query = new URLSearchParams({
    parameters: POWER_DAILY_PARAMETERS.join(','),
    community: 'AG',
    longitude: String(longitude),
    latitude: String(latitude),
    start,
    end,
    format: 'JSON',
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${query}`;
}

function validDaily(value, fillValue) {
  if (finite(value) === null || value === fillValue) return null;
  return value;
}

function seriesStats(series, fillValue) {
  const values = [];
  for (const raw of Object.values(series || {})) {
    const value = validDaily(raw, fillValue);
    if (value !== null) values.push(value);
  }
  if (!values.length) return { daysInSeries: Object.keys(series || {}).length, validDays: 0, sum: null, mean: null, min: null, max: null };
  const sum = values.reduce((total, value) => total + value, 0);
  return { daysInSeries: Object.keys(series || {}).length, validDays: values.length, sum, mean: sum / values.length, min: Math.min(...values), max: Math.max(...values) };
}

function buildChannel(code, series, meta, fillValue) {
  const daily = {};
  for (const [date, raw] of Object.entries(series || {})) {
    const value = validDaily(raw, fillValue);
    if (value !== null) daily[date] = value;
  }
  const summary = seriesStats(series, fillValue);
  return { code, unit: meta?.units ?? null, longName: meta?.longname ?? code, daily, summary, available: summary.validDays > 0 };
}

export function planningSnapshot(parsed) {
  const { channels } = parsed;
  return {
    precipitationAnnualMm: channels.precipitation.available ? channels.precipitation.summary.sum : null,
    temperatureMeanMaxC: channels.temperatureMax.available ? channels.temperatureMax.summary.mean : null,
    temperatureMeanMinC: channels.temperatureMin.available ? channels.temperatureMin.summary.mean : null,
    solarRadiationMeanDailyMj: channels.solarRadiation.available ? channels.solarRadiation.summary.mean : null,
  };
}

export function parsePowerDaily(json) {
  if (!json?.properties?.parameter || !json?.header?.start || !json?.header?.end) throw Error('no-data');
  const fillValue = finite(json.header.fill_value) ?? -999;
  const coordinates = json.geometry?.coordinates;
  const channels = {
    precipitation: buildChannel('PRECTOTCORR', json.properties.parameter.PRECTOTCORR, json.parameters?.PRECTOTCORR, fillValue),
    temperatureMax: buildChannel('T2M_MAX', json.properties.parameter.T2M_MAX, json.parameters?.T2M_MAX, fillValue),
    temperatureMin: buildChannel('T2M_MIN', json.properties.parameter.T2M_MIN, json.parameters?.T2M_MIN, fillValue),
    solarRadiation: buildChannel('ALLSKY_SFC_SW_DWN', json.properties.parameter.ALLSKY_SFC_SW_DWN, json.parameters?.ALLSKY_SFC_SW_DWN, fillValue),
  };
  if (!Object.values(channels).some(channel => channel.available)) throw Error('no-data');
  const parsed = {
    source: 'NASA POWER',
    dataset: json.header.title ?? 'NASA/POWER Daily',
    apiVersion: json.header.api?.version ?? null,
    status: Object.values(channels).every(channel => channel.available) ? 'ok' : 'partial',
    coordinates: { latitude: finite(coordinates?.[1]), longitude: finite(coordinates?.[0]), elevation: finite(coordinates?.[2]) },
    period: { start: json.header.start, end: json.header.end, startIso: formatPowerDate(json.header.start), endIso: formatPowerDate(json.header.end) },
    timeStandard: json.header.time_standard ?? null,
    fillValue,
    channels,
    missing: Object.values(channels).filter(channel => !channel.available).map(channel => channel.code),
    provenance: { sources: json.header.sources ?? [], community: 'AG', parameters: POWER_DAILY_PARAMETERS },
  };
  parsed.planning = planningSnapshot(parsed);
  return parsed;
}

export async function fetchPowerClimate(longitude, latitude, options = {}, signal) {
  assertPowerCoordinates(latitude, longitude);
  const period = options.start && options.end ? { start: options.start, end: options.end, year: options.year ?? options.start.slice(0, 4) } : defaultPowerPeriod(options.referenceDate);
  const url = powerDailyUrl(latitude, longitude, period.start, period.end);
  const json = await fetchJson(url, signal);
  const climate = parsePowerDaily(json);
  return { ...climate, retrieved: new Date().toISOString(), url, query: { longitude, latitude, ...period } };
}
