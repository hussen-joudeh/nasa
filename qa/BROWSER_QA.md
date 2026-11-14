# Browser QA — Manual, Partial

Date: 2026-11-14  
Target: `http://127.0.0.1:5173/` (local only)  
Durable result record: `qa/browser-live-results.json`

## Verified

- Desktop layout viewed at 1440×1000. The EOX Sentinel-2 2024 raster rendered in one session; later fresh loads were intermittent and sometimes fell back to the map error/retry state.
- Search for `Fresno` returned five GeoNames/Open-Meteo results. Selecting Fresno updated the map location/status.
- Coordinate editor accepted a four-corner WGS84 polygon. The app displayed 49.51 ha, 122.35 acres, center 36.78250, -119.95000, and enabled Analyze.
- Open-Meteo returned a live model sample: 14.6 °C, 0 mm, 17.5 km/h, 93%, at 2026-11-13T17:30 America/Los_Angeles. The app labels it as a modeled point sample, not a field average or sensor reading.
- Climate regression reproduced: CCKP returned HTTP 200 with `data.USA["2040-07"]`, but the old parser only read `data.tas.USA`, so the UI showed its no-data error. Added a regression test, observed it fail, then fixed the parser to accept both response shapes. After the fix, direct browser fetches returned live values: USA/SSP245 +1.91 °C, USA/SSP126 +1.57 °C, and Palestine/SSP126 +1.48 °C for 2040–2059. The app UI rendered the Palestine result with its country, scenario, horizon, retrieval time, and source link.
- Changing Rotation B, Season 1 from wheat to soybean updated the visible counts to 2 plant families, 2 legume seasons, and 1 same-family transition; restoring wheat returned the original counts.
- Browser save → clear → restore round-trip restored the selected polygon and area. The temporary test plan was removed from localStorage afterward.
- At 390×844, Arabic rendered with `lang="ar"`, `dir="rtl"`, and document width 390/390 (no horizontal overflow). The map loaded in one RTL mobile session after waiting for tiles.
- Terrain toggle reached `aria-pressed=true`, showed the 1× DEM status, and issued a request for a real Terrarium elevation tile. Full viewport DEM coverage and camera orbit were not established.

## Incomplete / blocked

- Map-tile loading is intermittent. In repeated fresh sessions the map remained unavailable or timed out; map controls stayed disabled and the retry/coordinate-entry fallback was available. Direct map-click drawing and undo therefore remain unverified; coordinate-based polygon selection works.
- Relief-layer appearance, terrain orbit/navigation, and DEM failure fallback were not fully verified.
- Climate was verified after the parser fix, but only a single national median is shown; it is not a field-level projection or ensemble-uncertainty range.
- JSON export/import, keyboard-only navigation, screen-reader behavior, contrast, and performance were not audited.
- A temporary browser screenshot was inspected, but no durable screenshot was retained in the repository. Pixel-level comparison against the two references remains open.
- `npm run qa:browser` / Playwright was not run; this was manual browser-harness QA.

No deployment, commit, or push was performed.
