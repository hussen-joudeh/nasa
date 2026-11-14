// Probes every candidate external data source for reachability, CORS headers and payload shape.
// Usage: node scripts/probe-sources.mjs [filter]
// Results are printed and written to qa/source-probe/probe-<timestamp>.json
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'qa', 'source-probe');
const ORIGIN = 'http://localhost:5173';
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

const lat = 36.7378;
const lon = -119.7871;

const probes = [
  {
    id: 'open-meteo-forecast',
    url: `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_temperature_0cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,weather_code&timezone=auto&forecast_days=7`,
  },
  {
    id: 'open-meteo-archive',
    url: `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2024-01-01&end_date=2024-01-10&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration&timezone=auto`,
  },
  {
    id: 'open-meteo-climate',
    url: `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=2045-01-01&end_date=2045-01-05&models=CMCC_CM2_VHR4,FGOALS_f3_H,HiRAM_SIT_HR,MRI_AGCM3_2_S,EC_Earth3P_HR,MPI_ESM1_2_XR,NICAM16_8S&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration_sum`,
  },
  {
    id: 'open-meteo-geocoding',
    url: `https://geocoding-api.open-meteo.com/v1/search?name=Fresno&count=5&language=en&format=json`,
  },
  {
    id: 'open-meteo-elevation',
    url: `https://api.open-meteo.com/v1/elevation?latitude=${lat},36.8&longitude=${lon},-119.6`,
  },
  {
    id: 'nominatim-search',
    url: `https://nominatim.openstreetmap.org/search?q=Fresno&format=jsonv2&limit=5&addressdetails=1&accept-language=en`,
    headers: { Referer: ORIGIN + '/' },
  },
  {
    id: 'nominatim-reverse',
    url: `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=ar`,
    headers: { Referer: ORIGIN + '/' },
  },
  {
    id: 'photon-search',
    url: `https://photon.komoot.io/api/?q=Fresno&limit=5&lang=en`,
  },
  {
    id: 'soilgrids-properties',
    url: `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&property=phh2o&property=soc&property=clay&property=sand&property=silt&property=nitrogen&property=bdod&property=cec&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean&value=Q0.05&value=Q0.5&value=Q0.95&value=uncertainty`,
    timeout: 60000,
  },
  {
    id: 'soilgrids-classification',
    url: `https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lon}&lat=${lat}&number_classes=5`,
    timeout: 60000,
  },
  {
    id: 'earth-search-stac',
    url: 'https://earth-search.aws.element84.com/v1/search',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      intersects: { type: 'Point', coordinates: [lon, lat] },
      datetime: '2025-06-01T00:00:00Z/2025-09-30T23:59:59Z',
      query: { 'eo:cloud_cover': { lt: 10 } },
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      limit: 2,
    }),
    after: async (json, log) => {
      const item = json?.features?.[0];
      if (!item) return;
      log.item = {
        id: item.id,
        datetime: item.properties?.datetime,
        cloud: item.properties?.['eo:cloud_cover'],
        epsg: item.properties?.['proj:epsg'] ?? item.properties?.['proj:code'],
        boa: item.properties?.['earthsearch:boa_offset_applied'],
        baseline: item.properties?.['s2:processing_baseline'],
        assetKeys: Object.keys(item.assets ?? {}),
        red: item.assets?.red,
        nir: item.assets?.nir,
        scl: item.assets?.scl,
      };
      const href = item.assets?.red?.href;
      if (href) {
        const r = await fetch(href, { headers: { Origin: ORIGIN, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30000) });
        log.cogRange = {
          href,
          status: r.status,
          acao: r.headers.get('access-control-allow-origin'),
          acah: r.headers.get('access-control-expose-headers'),
          contentRange: r.headers.get('content-range'),
          bytes: (await r.arrayBuffer()).byteLength,
        };
        const pre = await fetch(href, {
          method: 'OPTIONS',
          headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' },
          signal: AbortSignal.timeout(30000),
        });
        log.cogPreflight = {
          status: pre.status,
          acao: pre.headers.get('access-control-allow-origin'),
          acam: pre.headers.get('access-control-allow-methods'),
          acah: pre.headers.get('access-control-allow-headers'),
        };
      }
    },
  },
  {
    id: 'aws-terrain-terrarium',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/176/403.png',
    binary: true,
  },
  {
    id: 'aws-terrain-terrarium-vhost',
    url: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/10/176/403.png',
    binary: true,
  },
  {
    id: 'eox-capabilities',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml',
    after: async (_json, log, text) => {
      const ids = [...text.matchAll(/<ows:Identifier>([^<]+)<\/ows:Identifier>/g)].map((m) => m[1]);
      log.identifiers = ids.filter((i) => /s2cloudless|terrain|overlay|GoogleMaps/i.test(i));
    },
  },
  {
    id: 'eox-s2cloudless-2023',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/10/403/176.jpg',
    binary: true,
  },
  {
    id: 'eox-s2cloudless-2024',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/10/403/176.jpg',
    binary: true,
  },
  {
    id: 'eox-s2cloudless-2016',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/10/403/176.jpg',
    binary: true,
  },
  {
    id: 'gibs-ndvi-tile',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2024-06-01/GoogleMapsCompatible_Level9/5/12/5.png',
    binary: true,
  },
  {
    id: 'worldbank-cckp',
    url: 'https://cckpapi.worldbank.org/cckp/v1/cmip6-x0.25_climatology_tas,pr_climatology_annual_2040-2059_median_ssp245_ensemble_all_mean/USA?_format=json',
    timeout: 60000,
  },
  {
    id: 'ornl-modis-dates',
    url: `https://modis.ornl.gov/rst/api/v1/MOD13Q1/dates?latitude=${lat}&longitude=${lon}`,
    headers: { Accept: 'application/json' },
    timeout: 60000,
  },
  {
    id: 'nasa-power-climatology',
    url: `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`,
    timeout: 60000,
  },
  {
    id: 'openfreemap-style',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'esri-world-imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/403/176',
    binary: true,
  },
  {
    id: 'osm-tile',
    url: 'https://tile.openstreetmap.org/10/176/403.png',
    binary: true,
    headers: { Referer: ORIGIN + '/' },
  },
  {
    id: 'fao56-chapter6',
    url: 'https://www.fao.org/4/x0490e/x0490e0b.htm',
    timeout: 60000,
  },
];

async function run(p) {
  const log = { id: p.id, url: p.url };
  const t0 = Date.now();
  try {
    const res = await fetch(p.url, {
      method: p.method ?? 'GET',
      headers: { Origin: ORIGIN, 'User-Agent': 'field-shift-local-dev-probe/0.1', ...(p.headers ?? {}) },
      body: p.body,
      signal: AbortSignal.timeout(p.timeout ?? 30000),
    });
    log.status = res.status;
    log.ms = Date.now() - t0;
    log.contentType = res.headers.get('content-type');
    log.acao = res.headers.get('access-control-allow-origin');
    log.cacheControl = res.headers.get('cache-control');
    if (p.binary) {
      const buf = await res.arrayBuffer();
      log.bytes = buf.byteLength;
    } else {
      const text = await res.text();
      log.bytes = text.length;
      log.snippet = text.slice(0, 700);
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      if (p.after) await p.after(json, log, text);
    }
  } catch (e) {
    log.error = `${e.name}: ${e.message}${e.cause ? ' / ' + (e.cause.code ?? e.cause.message) : ''}`;
    log.ms = Date.now() - t0;
  }
  return log;
}

const selected = probes.filter((p) => !filter || filter.test(p.id));
const results = [];
for (const p of selected) {
  const r = await run(p);
  results.push(r);
  console.log(`\n=== ${r.id} :: status=${r.status ?? '-'} cors=${r.acao ?? '-'} ${r.ms}ms bytes=${r.bytes ?? '-'} ${r.error ?? ''}`);
  const { snippet, ...rest } = r;
  if (snippet) console.log(snippet.replace(/\s+/g, ' ').slice(0, 500));
  for (const k of ['item', 'cogRange', 'cogPreflight', 'identifiers']) if (rest[k]) console.log(k, JSON.stringify(rest[k]).slice(0, 1800));
}
await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(outDir, `probe-${stamp}.json`);
await writeFile(file, JSON.stringify({ ranAt: new Date().toISOString(), origin: ORIGIN, results }, null, 2));
console.log('\nwritten', path.relative(root, file));
