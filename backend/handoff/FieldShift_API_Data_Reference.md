# FieldShift API Data Reference

**Version 1.1 · Hackathon demo handoff**

This is the proposed naming and import contract for the data and backend teams. Use the same collection names explicitly in the MongoDB driver or Mongoose configuration. Once the first sample is approved, update this reference alongside any agreed schema change.

## Demo scope

- Region ID `scottsbluff_gering_ne`
- North Platte River valley around Scottsbluff and Gering, Scotts Bluff County, Nebraska, USA
- Bounding box `[west, south, east, north]` = `[-103.76, 41.79, -103.55, 41.93]`
- Start with one mapped irrigated field. Add a second when it supports the demo.
- Crop history and daily climate cover 2023–2025. Seasonal climate summaries compare May–September 2023 and 2024.

## Contributor handoff

- Each contributor processes their assigned sources and the relevant evaluation criteria. Use one shared list of demo fields with the same `field_id`, geometry, and centroid. If that list is pending, prepare source coverage and sample extraction, and mark any provisional field as a sample.
- Name source deliveries `<source_slug>__<collection>.jsonl`, for example `nasa_power__climate_daily.jsonl` and `usda_ssurgo__field_soils.jsonl`. Name the source's criteria rows `<source_slug>__criteria_mapping.csv`. Use lowercase source slugs with underscores.
- Source deliveries use the record fields and identifiers below. Put inputs that need a new schema or have different semantics in the criteria mapping with their native units and resolution, pending agreement on an API field. For example, satellite-estimated actual evapotranspiration and the farmer's available irrigation budget are different inputs.
- The integration owner assembles the canonical files in the next section. For a shared `_id`, combine compatible values while retaining their provenance. Resolve conflicting values using documented source selection rather than file order. Import the canonical files after that check.

## Final export file → MongoDB collection

| Exact export filename | Exact collection name | One record per | API lookup and main fields |
|---|---|---|---|
| `fields.jsonl` | `fields` | Field | Look up `_id = field_id` and check `region_id`. Read `name`, `geometry`, `centroid`, and `area_ha`. |
| `crop_history.jsonl` | `crop_history` | Field and year | Filter `field_id` and sort `year` ascending. Read `crop_id`, `crop_label`, and source details. `crop_id` can be `null` when a historical class cannot be matched to a supported crop. |
| `climate_daily.jsonl` | `climate_daily` | Field and date | Filter `field_id` and the requested `date` range. Read `precip_mm`, `tmin_c`, `tmax_c`, and `solar_kwh_m2_day`. Keep the NASA POWER parameters, original units, time standard, and grid metadata in `source`. |
| `climate_seasonal.jsonl` | `climate_seasonal` | Field and reference-year window | Filter `field_id`, `year`, and `period_start`/`period_end`. Read `precip_total_mm`, `hot_days_count`, `hot_day_threshold_c`, `valid_days`, and `expected_days`. Use the daily series for model calculations. |
| `field_soils.jsonl` | `field_soils` | Field, soil map unit, and depth interval | Filter `field_id`. Read `map_unit_id`, `depth_top_cm`, `depth_bottom_cm`, `texture`, and `available_water_capacity_mm_per_mm` where documented. Preserve multiple map units or depth intervals. |
| `crop_profiles.jsonl` | `crop_profiles` | Supported crop | Look up `_id = crop_id` for crop IDs used in the plans. Read `name`, `plant_family`, `seasonal_water_use_mm_min`, and `seasonal_water_use_mm_max`. Add growth windows or crop coefficients only when documented and agreed with the engine team. |
| `scenarios.jsonl` | `scenarios` | Historical event or hypothetical scenario | Filter `region_id` and use `field_id` when a scenario is field-specific. Read `scenario_type`, `title`, `period_start`, `period_end`, and `duration_days` when documented. Set `scenario_type` to `historical_event` or `what_if`. |
| `criteria_mapping.csv` | — | Criterion and source field | Handoff for the data and API teams. Columns `criterion,dataset,collection,output_field,unit,period,processing_method,missing_data`. |

## Format and identifiers

- JSONL uses UTF-8 with one complete JSON object per line. CSV is the separate criteria handoff.
- Use stable string `_id` values. Set the field document `_id` to its `field_id`. Children reference it through `field_id`. Use `<field_id>:<year>` for crop history and `<field_id>:<YYYY-MM-DD>` for daily climate. Use keys containing the dimensions in the table for the other collections, in a consistent order agreed during sample review.
- Use `region_id` for region-scoped records. GeoJSON geometries use WGS84 and `[longitude, latitude]` order. Store dates as ISO `YYYY-MM-DD` strings and years as integers in the export. Use JSON numbers for measurements.
- Record each input's source, URL, period, native resolution where relevant, value origin, and any conversion or aggregation. If a record combines sources, associate provenance with the relevant fields. Use `null` for a missing value and `missing_reason` to identify the affected field and reason. NASA POWER estimates, USDA crop classifications, derived summaries, and hypothetical scenario values should remain distinguishable.
- Keep GeoTIFF and NetCDF files separately and record references to the processed assets where needed.

## Import and API flow

1. Validate the file-to-collection mapping, field names, units, references, and unique `_id` values. Import JSONL into the collection shown above and upsert by `_id` for repeat imports.
2. For a comparison request, resolve the field and read its crop history, soil entries, and daily climate for the selected reference year. Read the crop profiles for the three plans. Include the seasonal summary if the interface displays the climate comparison.
3. Pass the evidence and farmer inputs to the comparison engine. Use the farmer's irrigation budget for each season as its own input. If the budget is unavailable, pass `null`. Keep a historical district outage as regional evidence unless field service at the event date is documented. Hypothetical inputs belong to `what_if` scenarios.
4. Return the assessment, source references, missing inputs, and any computed decision threshold. Preserve an `UNKNOWN` check when its input is unsupported or missing.

**Sample for sign-off** · Each contributor provides one representative record per applicable collection and their criteria rows. The combined backend sample includes the shared field record and, when available from the respective contributors, crop history, daily climate, and soil records linked to it.
