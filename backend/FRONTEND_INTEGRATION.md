# Frontend integration contract — documentation only

## Exact current hook
`src/app.mjs:183`, `analyze()`: replace only the `nasaTask=fetchPowerClimate(lon,lat)` choice for an explicitly selected canonical demo ID. Retain its request-generation check, concurrent current-weather task, result assignment to nasaClimate, and evaluation invalidation. Keep live NASA requests for every other field. Never infer demo identity from nearby coordinates or area. `setPolygon()` at line 117 clears climate and previous crop; future demo identity must also clear whenever a user changes the polygon, draws or restores an ordinary plan. No identity/saved-plan contract has been implemented.

`src/nasa-power.mjs:72`, `parsePowerDaily()` is the normalized parser; `fetchPowerClimate()` at line 100 adds retrieved/url/query metadata. `renderNasaClimate()` at app line 195 invokes rotation rendering, which feeds the same climate object to the existing Preflight/Water Truth chain. `src/preflight.mjs` runPreflight(rotation, fieldContext, climateData) and `src/water-truth.mjs` estimateWaterTruth consume those existing contracts; do not change their calculations.

## Adapter required, not implemented
Validate exact field ID `scottsbluff_gering_ne:csb1825:311825012125041`, response keys, unique ascending dates and 365-day 2025 coverage. Build a POWER-shaped parser input from climateDaily:
- header start/end: 20250101 / 20251231; time_standard: LST. Preserve actual source header/version and original 2023–2025 provenance separately; never claim the subset is the full archive.
- Calendar YYYY-MM-DD -> YYYYMMDD via string replacement, not timezone conversion.
- precip_mm -> PRECTOTCORR (mm/day); tmin_c -> T2M_MIN (C); tmax_c -> T2M_MAX (C).
- solar_kwh_m2_day -> ALLSKY_SFC_SW_DWN multiplied by 3.6 (MJ/m^2/day), only for non-null finite values.
- Preserve nulls, never coerce null to zero. Supply parameter unit metadata expected by parsePowerDaily.
- Use stored sample/source geometry and retain gridded-estimate provenance, native resolution and LST. Do not label API retrieval as a new NASA observation. Agree on archive acquisition versus API retrieval timestamps and a source URL suitable for the current provenance link.
- Stored GeoJSON ring is closed; remove only its duplicate closing vertex in the UI copy. Keep the stored geometry intact. The stored equal-area hectares may differ slightly from the UI spherical estimate: document both methods, do not silently override engine area.

## Missing contracts
A same-origin development proxy/route is required: ports 5173 and 5174 differ, and this API deliberately has no CORS setup. Keep the MongoDB URI server-side.

Preserve default plans: wheat/maize/wheat; wheat/soy/sunflower; chickpea/wheat/soy. No automatic maize->corn or wheat->winter_wheat mapping. Soy and sunflower profiles are absent; historical crop_id values are unresolved nulls. Do not set previousCrop from unapproved USDA labels.

field.irrigation_budget_mm is null. Keep blank UI input and null engine budget until entered by the farmer; engine contract is {amount,unit:mm|m3,period:perSeason|wholePlan}. Separate seasonal budgets have no agreed contract. Soil rows are evidence only; no numeric soil engine adapter exists. Historical irrigation is not current water availability. Regional 2019 disruption is not proof of field service; the 50% scenario is hypothetical, not a farmer budget.

No frontend code or scientific engine was changed for this handoff.
