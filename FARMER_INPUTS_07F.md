# Batch 07F — Farmer-verified inputs & decision contracts

## Inputs that change engine results (existing formulas only)

| Input | Storage | Consumed by | Effect |
|--------|---------|-------------|--------|
| Farmer-confirmed previous crop | `plan.farmerInputs` (local) | `evaluateRotation` → `rotation.history` (season 1) | UNKNOWN ↔ PASS/WARNING on family repeat vs season 1 |
| Unconfirmed crop pick | UI only | None | No calculation |
| MongoDB CDL `crop_history` | MongoDB | Evidence panel only | **Never** wired to engine |
| Irrigation budget (non-empty, valid) | `plan.preflightInputs.waterBudget` | `readBudget` → Water Truth `water.budget`, `water.balance`, plan balance | UNKNOWN → PASS/WARNING/FAIL on sufficiency |
| Null / missing budget | — | Water Truth | Stays UNKNOWN |
| Stored `irrigation_budget_mm` null | MongoDB field record | Display / evidence | **Not** copied into budget input |
| NASA POWER daily | Live or demo API | Rotation climate context, Water Truth ET | Unchanged |
| Crop profiles / crosswalk | MongoDB | Compatibility API | **Not activated** |

Preflight, Decision Breakpoint, and BioFirewall contracts unchanged except they receive `previousCrop` only when farmer-confirmed.

## Provenance

- `farmer_assertion` on confirmed previous crop and entered budget.
- `fieldScope` ties inputs to demo field ID or polygon fingerprint; mismatch clears confirmation on field change.