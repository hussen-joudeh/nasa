# FieldShift backend and data handoff

Open this file after extracting `FieldShift_Backend_Handoff.zip`. Use this plan with the latest frontend on your machine.

## What to send and where to start

| Location in the ZIP | Purpose |
|---|---|
| `FieldShift_Backend_Handoff.md` | Setup, completed work, and integration plan |
| `FieldShift_API_Data_Reference.md` | v1.1 schema and provenance contract |
| `backend/` | Standalone Node.js importer and read-only API, with `package.json`, `package-lock.json`, and its own README |
| `backend/FieldShift_Canonical_MongoDB_Import.zip` | All canonical MongoDB documents in UTF-8 JSONL, plus `manifest.json`, `criteria_mapping.csv`, validation report, GeoJSON, raster clips, and source evidence |
| `source-archives/` | All three corrected source deliveries, with source-specific records, regional context, and original evidence |

Use the canonical ZIP as the import source. Use the source archives for traceability and any later supplemental data work. Each JSONL line is a separate JSON object. Import collection names exactly as listed in the manifest. The schema reference is included as supplied.

## What already works

- The importer checks record counts, unique string `_id` values, and declared asset hashes before writing. It imports `fields` and `crop_profiles` first, then the remaining collections. It upserts by `_id` and adds query indexes for daily climate, crop history, and soils.
- The standalone API already serves `GET /api/demo-field`. It returns `{ storage, field, climateDaily, cropHistory, soils }` for the proposed field. The response includes 365 ordered 2025 climate days in NASA POWER Local Solar Time (`LST`), 3 crop-history records, and 26 soil records. It binds to localhost on port 5174 by default.
- An isolated MongoDB test imported 1,138 documents across the seven collections. A second import inserted zero documents. The API returned the expected records and rejected POST with HTTP 405.
- A separate frontend demo on the original machine was reported to render all three plans from MongoDB and show `UNKNOWN` for a blank irrigation budget. That demo's frontend changes are outside this handoff. Apply the integration on your latest frontend when its current edits are ready.
- The canonical validation report reflects the data delivery date. The successful MongoDB import and API test happened afterward.

## 1. Get the backend running on your computer

Keep `backend/` in a separate folder from the frontend project. With Node.js 18+ and a running local MongoDB instance, open a terminal in the extracted `backend/` directory.

```sh
npm ci
npm run db:import
npm start
```

On Windows, `npm run db:import` extracts the bundled canonical ZIP into `.local/canonical`. On other systems, extract the ZIP first and pass the directory containing `manifest.json`.

```sh
npm run db:import -- "/absolute/path/to/extracted-canonical-package"
```

The default URI is `mongodb://127.0.0.1:27017` and the default database is `fieldshift_demo`. Use a dedicated demo database. Set `MONGODB_URI` or `MONGODB_DATABASE` in the backend environment when you need different values. Keep connection details on the server. The API runs on port 5174 alongside a frontend running on port 5173. Set `PORT` if 5174 is in use.

Open `http://127.0.0.1:5174/api/demo-field` and check the record counts. Run `npm run db:import` again from a second terminal and look at `qa/mongo-import-results.json`. Expect `upserted: 0` for every collection on the repeat run.

| JSONL file | MongoDB collection | Expected | Contents |
|---|---|---:|---|
| `fields.jsonl` | `fields` | 1 | Proposed field boundary, centroid, area, and provenance |
| `crop_history.jsonl` | `crop_history` | 3 | USDA classes for 2023 alfalfa, 2024 corn, and 2025 dry beans |
| `climate_daily.jsonl` | `climate_daily` | 1,096 | NASA POWER daily precipitation, Tmax, Tmin, and solar radiation in LST, 2023–2025 |
| `climate_seasonal.jsonl` | `climate_seasonal` | 2 | May–September summaries for 2023 and 2024 |
| `field_soils.jsonl` | `field_soils` | 26 | SSURGO component and horizon rows across six map units |
| `crop_profiles.jsonl` | `crop_profiles` | 8 | Draft crop IDs, families, and sourced seasonal water-use ranges |
| `scenarios.jsonl` | `scenarios` | 2 | Regional 2019 canal outage and a simulated 50% irrigation restriction |

## 2. Connect the current frontend

1. Agree on the demo field `scottsbluff_gering_ne:csb1825:311825012125041` (22.220372 ha). Its boundary is proposed. A mapped 2005 center pivot provides historical irrigation evidence. Current irrigation, the farmer's available water, and service during the 2019 outage remain unverified.
2. Add an explicit demo field selection in your latest frontend. Have **Analyze this field** load `GET /api/demo-field` for that selection. Use a same-origin development proxy or server route to forward the browser request to the standalone API. Keep the normal live climate flow for other field selections.
3. Adapt `climateDaily` into the object consumed by the current comparison and Preflight engines. In the checked frontend version, the integration point was `analyze()` in `src/app.mjs`, which assigns `nasaClimate`. Reuse `parsePowerDaily()` from `src/nasa-power.mjs` if these functions are still in place. Use `NASA POWER` provenance, keep `LST` and the stored source metadata, convert `YYYY-MM-DD` calendar keys to `YYYYMMDD` without timezone shifts, and preserve nulls as missing inputs. Supply precipitation in `mm/day`, temperatures in `C`, and multiply `solar_kwh_m2_day` by 3.6 to supply the parser with `MJ/m²/day`.
4. Use the full 2025 daily series for this first comparison. The existing water engine needs coverage for the full crop cycle. May–September 2023 and 2024 are precomputed display summaries. Use the stored boundary for the explicit demo field. If the existing polygon validator expects a list of vertices, omit the closing duplicate in the UI copy and keep the stored GeoJSON ring intact.
5. Initially use the three plans and crop catalog already in your frontend. The checked version had A `wheat → maize → wheat`, B `wheat → soy → sunflower`, and C `chickpea → wheat → soy`. Verify them against your latest code. Decide with the team which plan represents the farmer's current rotation. The historical crop rows describe prior classifications and supply no verified farmer plan.
6. Review the crop crosswalk before connecting database profiles to the engine. Frontend `maize` corresponds to packaged `corn`, pending team sign-off. Generic `wheat` needs a wheat-type decision before mapping to `winter_wheat`. The package has no soybean or sunflower profile. Keep historical `crop_id` null for unresolved matches and preserve the USDA labels. Set `previousCrop` only when the immediately preceding crop and its engine ID are verified. Use crop water-use ranges as sourced evidence and keep the engine's crop coefficients and calendars separate.

## 3. Verify the first comparison and decide what to build next

- In the browser, select the demo field and analyze it. Verify the displayed provenance, the full 2025 period, and all three plan results. Check that crop history and soil evidence use the same field ID. The current engine has no numerical soil input contract, so use the soil rows for inspection until the team defines one.
- Run Preflight with the irrigation input blank and confirm the affected water check is `UNKNOWN`. Follow the current engine contract for a supplied budget (`{ amount, unit, period }` with `mm` or `m3` and `perSeason` or `wholePlan`). Distinct budgets by season require an agreed engine or API contract. Keep the 2019 event regional. If you wire the 50% what-if scenario, apply it to a supplied baseline and label the result as simulated.
- Switch to another field and verify its regular live climate request. For the demo field, use the MongoDB climate response for the comparison.
- Record the import counts, one successful browser comparison, and one missing-budget result. Where supported, review the reasons, evidence, missing inputs, and the Decision Breakpoint.
- The existing frontend can run the engine using the evidence endpoint. The routes `GET /api/fields`, `GET /api/fields/:fieldId`, `GET /api/crops`, and `POST /api/rotations/compare` from the earlier plan are future options. If the team wants the server to run the engine, agree on the route and request/response shape first, then reuse the existing calculations. Saved plans and comparison history can be scoped separately.
- Field-level OpenET and GEDI measurements remain pending. The source archive includes OpenET results for its original sample polygon. Keep both with their stated scope.

Keep this demo local. The handoff includes no frontend edits, database credentials, MongoDB binaries, or machine-specific database files.
