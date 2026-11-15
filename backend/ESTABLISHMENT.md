# Batch 07A — local establishment report

Status: BLOCKED on local MongoDB, 2026-11-15.

## Location and isolation
`backend/` is a standalone package with its own package-lock, MongoDB 6.22.0 driver, importer and native HTTP server. It is not imported into the frontend or included in its build. Original handoff documents and source archives are in `backend/handoff/`; the original canonical ZIP is unchanged. Extracted records are ignored under `.local/canonical/`. No frontend files were edited in this batch.

## Verified
- `npm ci --prefix backend --ignore-scripts`: installed 12 packages; audit reported zero vulnerabilities.
- `npm test --prefix backend`: 6 tests passed. Tests cover canonical counts, unique string IDs, field references, declared manifest asset hashes, field area, numeric climate and soil-depth types, date ordering, LST metadata, null irrigation budget and unresolved crop IDs; HTTP fixture contract, unsupported methods, missing field and sanitized storage errors.
- Offline canonical counts: fields 1; climate_daily 1096; climate_seasonal 2; crop_history 3; field_soils 26; crop_profiles 8; scenarios 2. Total 1138. 2025 includes 365 daily records. These are FILE counts, not MongoDB counts.
- Actual existing importer attempted against the default local endpoint: ECONNREFUSED 127.0.0.1:27017, before writes.
- Actual standalone server started on 127.0.0.1:5174. GET /api/demo-field returned controlled JSON 503. POST returned 405 with Allow: GET. Successful GET was tested only with the canonical fixture, not a live database.
- Evidence is in ignored `backend/qa/tests.txt`, `import-attempt.txt`, `live-api-results.json`.

## Setup requirement and remaining acceptance checks
No MongoDB listener, Windows service, PATH command (mongod/mongosh), or standard Program Files/MongoDB installation was found. Install/start an authorized local MongoDB Community instance listening at 127.0.0.1:27017, or provide an existing authorized MongoDB connection through backend-only environment variables. No database software was installed.

Before importing, inspect fieldshift_demo's collections and document IDs with the MongoDB driver. If existing data is unrelated, stop and choose a dedicated empty demo database. The supplied importer replaces matching IDs and does NOT provide a transaction or an unrelated-data guard; its count check happens after writes. Do not use it against an unreviewed populated database.

Then run from backend:
1. `npm run db:import` (Windows extracts the canonical ZIP).
2. Inspect all seven MongoDB collection counts and actual indexes. Expected query indexes are climate_daily {field_id:1,date:1}, crop_history {field_id:1,year:1}, field_soils {field_id:1}, plus MongoDB's unique _id indexes.
3. Preserve the first import report; repeat import and confirm zero upserts, unchanged counts, and no duplicate IDs.
4. GET http://127.0.0.1:5174/api/demo-field: confirm field ID, 22.220372 ha, storage MongoDB, 365 ordered 2025 LST climate records, 3 historical crops, 26 soils, null irrigation_budget_mm.

Database contents, actual indexes, import repeatability, and successful live database GET remain unverified. No commit, deployment or Batch 07B integration performed.
