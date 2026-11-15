# Batch 07D — evidence readiness and scientific approval

## Active vs contextual contracts
- DIRECT_INPUT: selected proposed polygon (existing spherical area calculation) and daily NASA POWER evidence. Daily Tmax/Tmin/precipitation feed Water Truth, daily climate also supplies existing climate context; solar remains displayed, not a new water-model input. A direct-input label is not farmer verification.
- REQUIRES_CONFIRMATION: mapped USDA crop history (2023 Alfalfa, 2024 Corn, 2025 Dry Beans); all stored crop_id values remain null. No API records establish farmer confirmation or an approved immediate-prior-crop mapping. `domain.evaluateRotation` accepts only an existing engine ID for the immediately preceding crop, not an arbitrary annual historical sequence.
- CONTEXT_ONLY: 26 SSURGO horizon records, preserved individually with map unit/component, depth cm, texture, and AWC mm/mm; map survey attributes are not lab measurements. No soil penalty or depth aggregation is implemented. 2023/2024 seasonal summaries remain historical context.
- UNSUPPORTED: soybean and sunflower have no canonical profile. Malformed history/soil records are marked unsupported, not consumed.

Readiness records include source, scope, temporal coverage, units, missing top-level values, verification status, explicit consumer and reason. Scientific details remain expandable. Farmer water availability remains a separate missing input; no archived evidence substitutes for it.

## Mapping decision table — no approvals granted
| Engine crop | Canonical candidate | Identity/family and season assessment | Decision |
|---|---|---|---|
| wheat | winter_wheat | Generic engine wheat vs winter-specific profile; Poaceae alignment does not establish season/calendar | Proposed; approval required |
| maize | corn | Zea mays / Poaceae candidate, grain use; name alignment does not validate Kc/calendar | Proposed; approval required |
| chickpea | chickpea | Exact slug and Fabaceae; profile uses trial water range; engine lacks a chickpea Water Truth calendar | Exact identity candidate only; not calculation-compatible |
| soy | none | Fabaceae engine crop; no profile | Unsupported profile connection |
| sunflower | none | Asteraceae engine crop; no profile | Unsupported profile connection |
| — | barley, alfalfa, sugar_beet, dry_bean, lentil | Database-only crop profiles | Outside current engine catalogue |

No canonical profile is approved as an exact *model-compatible* input. Seasonal water-use ranges do not replace FAO Kc coefficients. Existing engine plans and choices stay unchanged.

## Verification and operation
Both May–September seasonal totals and >=35 C hot-day counts matched the actual MongoDB daily series for the corresponding years. The UI correctly says those 2023–2024 windows cannot be compared with its loaded 2025 daily slice. No seasonal values were changed.

The previously running backend on 5174 served an older API and denied process termination. Current 07C source runs on 5176 for verification, with frontend on 5177 and FIELDSHIFT_API_PORT=5176. The default remains 5174. Restart the elevated/stale backend through its owning terminal to use default ports. No database writes or API contract changes were made.

Modules: src/evidence-readiness.mjs (contract, validators, compatible-window comparison), src/evidence-view.mjs (bilingual presentation), src/demo-evidence.mjs (validated supplemental routes with explicit failure states), src/app.mjs (compact evidence section). Build manifests and tests include the modules. No agricultural engine changed.

Outstanding scientific approvals: farmer-confirmed preceding planting and exact engine identity; crop season/Kc/calendar compatibility; defensible soil rules; actual farmer irrigation budget. None is silently assumed.

Final verification: 137 frontend tests, 11 backend tests, existing browser QA, and all eight targeted integration checks passed; build passed. Actual screenshots: qa/evidence/batch07d/evidence.png, history-evidence.png, preflight-unknown.png, mobile-ar.png, mobile-preflight-ar.png. The normal frontend on 5173 was restarted with FIELDSHIFT_API_PORT=5176; 5177 was the isolated QA frontend. The stale protected backend remains on 5174.

