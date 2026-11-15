# FieldShift MongoDB demo API

Extract this archive into its own directory. It includes the canonical data ZIP, the importer, and the local read-only API.

## Run locally

Requires Node.js 18 or newer and a running local MongoDB service. Run these commands in the extracted directory.

```sh
npm ci
npm run db:import
npm start
```

On systems other than Windows, extract `FieldShift_Canonical_MongoDB_Import.zip` first, then run `npm run db:import -- /absolute/path/to/extracted-package`. On Windows, `npm run db:import` extracts the bundled ZIP into `.local/canonical` automatically.

The default database is `fieldshift_demo` at `mongodb://127.0.0.1:27017`. Set `MONGODB_URI` or `MONGODB_DATABASE` for a different development database. Import into a database dedicated to this demo.

Open http://127.0.0.1:5174/api/demo-field to inspect the response. The API binds to localhost. Set `PORT` to use another port.

## API and checks

`GET /api/demo-field` returns `storage`, `field`, `climateDaily`, `cropHistory`, and `soils` for the proposed Scottsbluff–Gering demo field. Expect 365 ordered NASA POWER LST records for 2025, three crop history records, and 26 SSURGO rows. The actual irrigation budget remains null. A repeated import upserts documents by `_id` and reports counts in `qa/mongo-import-results.json`.

Integrate the current frontend when the team is ready to wire its Analyze Field action to this API.

## Batch 07A status
See ESTABLISHMENT.md for local verification and the MongoDB blocker; FRONTEND_INTEGRATION.md records the current adapter contract. Frontend integration is not implemented. Run npm test after extracting the canonical ZIP into .local/canonical.

