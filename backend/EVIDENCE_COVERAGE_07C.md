# Batch 07C — Evidence coverage matrix (seven collections)

Legend: **S** stored in MongoDB · **A** exposed by read API · **D** displayed in frontend · **C** used in scientific engine calculation.

| Collection | Key fields & units | Provenance | Temporal / spatial | Gaps | API (GET) | UI | Engine |
|---|---|---|---|---|---|---|---|
| **fields** | `area_ha` (ha), `geometry`/`centroid` (WGS84), `irrigation_budget_mm` (mm, null) | Canonical `fields.jsonl`; proposed approval pending | Single Scottsbluff–Gering polygon | Budget null; proposed status | `/api/demo-field` | Demo picker, boundary | Polygon area, center; **not** budget |
| **climate_daily** | `precip_mm`, `tmin_c`, `tmax_c`, `solar_kwh_m2_day`; LST | NASA POWER daily point per row `source` | 2023–01–01 … 2025–12–31 grid sample at centroid; analyze uses **2025 only** (365 d) | Grid estimates, not field sensor | `/api/demo-field` (2025 slice) | NASA panel, provenance | **Yes** — `parsePowerDaily` → Water Truth / climate checks |
| **climate_seasonal** | `precip_total_mm`, `hot_days_count` @ `hot_day_threshold_c` °C; May–Sep windows | Derived from daily archive; `value_origin: calculated` | 2023 & 2024 growing seasons; LST | Not a forecast | `/api/demo-field/climate-seasonal` | Optional supplement text | **No** — historical summary only |
| **crop_history** | `year`, `crop_label`, CDL `class_code`, `crop_id: null` | USDA CDL regional subset | 2023–2025 | Engine IDs unresolved | `/api/demo-field` | Evidence details | **No** — display; `crop_id` null blocks history rule |
| **field_soils** | `depth_top_cm`–`depth_bottom_cm`, `texture`, AWC mm/mm | SSURGO map units | 6 units, 26 horizons | Not merged across depths in engine | `/api/demo-field` | Evidence details | **No** — no soil hydraulics in Water Truth |
| **crop_profiles** | `seasonal_water_use_mm_min/max`; `proposed_for_engine_review` | Extension / trial sources per profile | Regional / trial scope varies | **Not** FAO Kc; must not drive engine | `/api/crop-profiles`, `/api/crop-compatibility` | Not in calculations | **No** — evidence catalog only |
| **scenarios** | `scenario_type`, `period_*`, `duration_days`; budgets null | USBR event + local what_if | 2019 outage (region); 2024 what_if on field | Field service & budgets unverified | `/api/demo-field/scenarios` | Optional supplement | **No** — not wired to Preflight |

## API contracts (07C)

| Route | Response | Notes |
|---|---|---|
| `GET /api/demo-field` | unchanged `{storage,field,climateDaily,cropHistory,soils}` | 2025 daily slice for analysis |
| `GET /api/health` | `{storage,ready,collections[],fieldId}` | No secrets |
| `GET /api/demo-field/climate-seasonal` | `{climateSeasonal[],semantics.notForecast:true}` | LST enforced |
| `GET /api/demo-field/scenarios` | `{scenarios[]}` | Includes regional historical + field what_if |
| `GET /api/crop-profiles` | `{cropProfiles[],compatibility[],semantics}` | Water ranges not Kc |
| `GET /api/crop-compatibility` | `{compatibility[],note}` | Proposed mappings only |

Errors: **405** non-GET · **400** unsupported query · **404** missing import/field · **422** malformed stored evidence · **503** MongoDB down (no fabricated fallback).

## Scientific blockers (not silently resolved)

1. Activate crop_profile ↔ engine crosswalk (team approval).
2. Use seasonal summaries in UI without mislabelling as forecasts.
3. Farmer irrigation budget and 2019 field-specific service.
4. Penman–Monteith vs Hargreaves–Samani for Water Truth.
5. Soil AWC / depth rules before any soil-informed irrigation model.
6. Convert `crop_history.crop_id` from CDL classes.

See `backend/handoff/FieldShift_API_Data_Reference.md` and manifest `unresolved_gaps`.