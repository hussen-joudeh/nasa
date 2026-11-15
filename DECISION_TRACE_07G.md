# Batch 07G — Decision trace audit

## Rules that change outcomes (not display-only)

| Domain | ruleId | Deciding inputs | Engine |
|--------|--------|-----------------|--------|
| Rotation | `rotation.sequence` | Three catalog crop IDs | `evaluateRotation` |
| Rotation | `rotation.family` | Adjacent crops in plan | `evaluateRotation` |
| Rotation | `rotation.diversity` | Families in plan | `evaluateRotation` |
| Rotation | `rotation.legume` | Legume slots | `evaluateRotation` |
| Rotation | `rotation.history` | **Farmer-confirmed** `previousCrop` only | `evaluateRotation` |
| Rotation | `rotation.compatibility` | *(none encoded)* → UNKNOWN | `evaluateRotation` |
| Rotation | `rotation.climate` | NASA POWER annual summaries if loaded | `evaluateRotation` |
| Water | `water.budget` | Valid farmer `waterBudget` + area | `estimateWaterTruth` |
| Water | `water.balance` / `water.plan-balance` | Budget + climate + illustrative settings | `estimateWaterTruth` |
| BioFirewall | `biofirewall.*` | Farmer memory records | `evaluateBioFirewall` |

**Not calculation inputs:** MongoDB `crop_history`, `field_soils`, seasonal summaries, crop profiles, proposed mappings, stored null `irrigation_budget_mm`.

## Trace contract

- Built from existing `runPreflight` output only (`decision-trace.mjs`).
- Version `fieldshift-07g`; fingerprint for reproducibility.
- Snapshot optional on save (`decisionSnapshot`); climate must be re-fetched after restore.

## Farmer assertions

- Provenance `farmer_assertion`; explicitly not independently verified.
- Change log links `inputChanged` → `ruleId` status delta.