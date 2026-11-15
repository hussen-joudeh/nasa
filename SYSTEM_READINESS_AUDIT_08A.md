# FieldShift — Batch 08A System Readiness Audit

**Audit date:** 2026-11-15 · **Scope:** the code and running services as they actually are; earlier PASS claims were re-checked, not trusted. No fixes were made. This file is the only one the audit created in the repo. Running the existing test commands rewrote their own output files (`dist/`, `qa/browser-results.json`, `qa/screenshots/`, `qa/evidence/batch07e/smoke-live.json`).

## 1. Readiness verdict: **CONDITIONALLY READY**

On the aligned live stack (frontend **5179** with its API proxy pointed at backend **5178**, which reads MongoDB `fieldshift_demo`), the English desktop journey runs end to end. The presentation is safe only if all of these hold:

- (a) The presenter uses that aligned stack. The default ports, and the 5173 frontend that is currently running, are not aligned with the verified backend.
- (b) The presenter does not demo Export followed by Import.
- (c) Arabic is presented knowing that some panels mix in English text.
- (d) The illustrative water demo's 1 January planting date is called out as illustrative.

## 2. Top five risks

1. **Export and Import cannot round-trip.** A plan exported after the demo journey is 208,664 bytes, but Import rejects anything over 100,000 bytes. The error shown blames the file format instead.
2. **Wrong backend at presentation time.** Default `npm run dev:local` targets 5174, which is a stale API with no `/api/health` and no supplemental routes. The running 5173 frontend proxies to the 07C API on 5176, which uses the old health contract. Only 5178 and 5179 are verified.
3. **The saved decision snapshot is not trustworthy.** It survives field and input changes. It records no demo field ID, and its farmer impact is one run behind. Restore never compares the saved snapshot with a new run. If the engine version changes, the whole saved plan is rejected.
4. **Arabic and plain-language gaps in the decision panels.** These panels show English sentences, raw status tokens (`UNKNOWN → WARNING`), and code identifiers (`rotation.history`, `farmerInputs.previousCrop.confirmed`, `evaluateRotation domain.mjs`). One Arabic label was corrupted during 07F.
5. **Scientific presentation.**
   - The Decision Breakpoint demo plants every crop on 2025-01-01 in Nebraska.
   - Several trace provenance labels are wrong.
   - The area is labelled "validated" although it is a proposed boundary.
   - Two different areas appear on screen at once (22.220372 ha stored and 22.19 ha computed).

## 3. P0 / P1 / P2 action plan

Every row was verified directly unless it is marked *(code reading)*.

| ID | Pri | Finding | File / evidence | Repro | Impact | Minimal correction | Acceptance test |
|---|---|---|---|---|---|---|---|
| A1 | **P0** | Export→Import round trip fails | `src/app.mjs:130` `f.size>100000`; exported plan **208,664 B**; decision snapshot alone **124,188 B** | Demo → Analyze → confirm crop → budget 150000 m³ → Run Preflight → Export → Import same file | Message "Unable to read this plan. Use a Field Shift v1 JSON export."; the saved analysis is lost | Raise the import limit (e.g. 1 MB), or export a compact snapshot (statuses + fingerprint, without full traces) | Exporting after the full journey and importing the same file restores the inputs and the snapshot |
| A2 | **P0** (ops) | Presented URL is not aligned with the verified backend | 5174: `/api/health`, `/climate-seasonal`, `/crop-profiles` → 404. 5173 proxies 5176 (07C health shape). Default smoke: `backend_health_route_exists` FAIL | `node scripts/smoke-live.mjs` with no `FIELDSHIFT_*` environment variables | Demo evidence panel fails, or readiness is wrong | No code change. Present at 5179, or restart 5173 from its owning terminal with `FIELDSHIFT_API_PORT=5178`. Do not kill unknown processes | `smoke:live` PASS against the exact URL to be presented |
| B1 | P1 | Stale snapshot and traces survive field changes | `app.mjs:120,146` (`clear`, `setPolygon`) never reset `decisionSnapshot`/`decisionTraces`; they are assigned only at lines 145 and 189 *(code reading)* | Run Preflight on the demo → enter coordinates for another field → Save | The saved plan carries another field's decision record | Set both to `null` in `setPolygon`, `clear`, and the farmer and Preflight input handlers | Saving after a field change gives `decisionSnapshot === null` |
| B2 | P1 | Demo identity never recorded | `app.mjs:135,187` read `demoSelection.field.id`, but Mongo uses `_id`. Snapshot `field.demoFieldId` = `null` (live probe) | Run Preflight on the demo → Export → inspect the JSON | The snapshot cannot show it was built on MongoDB evidence | Use `field._id` | Snapshot `demoFieldId` equals the canonical ID |
| B3 | P1 | Snapshot holds the previous run's farmer impact | `app.mjs:187–189` builds the snapshot before `updateFarmerImpact()` *(code reading)* | Change the budget → Run Preflight → Save → compare `farmerImpact` with the panel | The record disagrees with the screen | Build the snapshot after the impact update | `snapshot.farmerImpact` equals the impact shown on screen |
| B4 | P1 | Restore does not reproduce the analysis | `app.mjs:145`: restore clears the demo link. UI: "No MongoDB association", 0 evaluations, snapshot never shown or compared | Save → Clear → Restore | "Why this result?" disappears; re-analysis uses live NASA, not the archive | After restore, re-run with the same source and show whether the result matches the saved snapshot fingerprint | Restore → Analyze → Preflight shows "matches saved snapshot" |
| B5 | P1 | Engine version bump rejects the whole plan | `readSaved` with snapshot version `fieldshift-08x` → throws `snapshot` (live probe) | Edit the version in an export → Import | Every 07G plan becomes unreadable after any trace change | On a version mismatch, drop the snapshot with a notice and keep the plan | Import of a mismatched version restores inputs and notes "snapshot from older engine" |
| C1 | P1 | Wrong trace provenance | `decision-trace.mjs` `inputProvenance`: `water.field-area`, `crop-settings`, `effective-rainfall-scope` → `stored_daily / climateDaily` (probe). The UI shows "Not recorded" for Field area | Run Preflight → open "Why" → Field area | Misstates evidence lineage | Map these to polygon / illustrative setting / slope confirmation | Each `water.*` rule names its true input |
| C2 | P1 | Implausible demo calendar | `app.mjs:196` sets all planting dates to `period.startIso` = 2025-01-01. Maize is planted Jan 1 and harvested May 30 in Scottsbluff. Need 271–313 mm, vs 579–630 mm at an Apr 15–May 1 planting | Click "Load illustrative water demo" | The Breakpoint example rests on an impossible season | Label the dates as non-agronomic on screen, or leave them blank so the result stays UNKNOWN until entered (no new algorithm) | Demo shows its planting dates with an explicit warning |
| C3 | P1 | Area wording and two numbers | i18n `fieldArea:'Validated field area'`; demo status shows 22.220372 ha (stored), the panel and Water Truth use 22.1876 ha (computed, −0.15%) | Select the demo field | Overclaims verification; confusing figures | Say "Calculated area (proposed boundary)" and name which value feeds Water Truth | One labelled area source in the Preflight panel |
| D1 | P1 | Arabic regression | `i18n.mjs:70` `movementDestination:'حقل وجهة الحقل'` (git diff: was `'حقل وجهة الحركة'`) | Arabic → BioFirewall missing inputs | Wrong label ("field destination field") | Revert the string | Matches the HEAD string |
| D2 | P1 | Mixed-language and developer text | Arabic farmer panel: "Immediately preceding crop (farmer-confirmed only)", "Farmer-entered irrigation budget…", `UNKNOWN → WARNING`, `rotation.history`. "Why": `evaluateRotation domain.mjs`; change trace `farmerInputs.previousCrop.confirmed` | Arabic + mobile 390 px after the farmer steps (`10-ar-mobile-plan.png`) | Poor clarity for farmers and the jury | Localize `summarizeFarmerImpact` details and status tokens; hide engine, module and path names behind "technical details" | No Latin-script words in Arabic farmer and trace panels except NASA, MongoDB, ETo |
| E1 | P1 | `npm test`, `tsc` and vite broken by 07E | `vite.config.ts:1` imports `loadEnv` from `vitest/config` (not exported); TS2591 `process`. Vitest fails at "Startup Error"; `npm run dev` (vite) shares the config *(inferred, not run)* | `npx vitest run`; `npx tsc --noEmit -p tsconfig.json` | React/Vite test path dead; CI would fail | Import `loadEnv` from `vite`; add node types | vitest loads config; tsc exit 0 |
| E2 | P1 | Browser QA misses the core journey | `scripts/qa-browser.mjs` has no demo, Preflight, farmer, trace, snapshot export or 3D steps; its results list 9 shell checks | Read the results file | A regression in A1 or B1–B5 passes QA | Add the 08A journey (§8) to `qa:browser` | QA fails on A1 today and passes after the fix |
| E3 | P1 | Nothing from batches 06–08 is committed | `git status` shows 63 modified or untracked paths; HEAD `f8a074b` | `git status --short` | A single-copy loss risk before the presentation | User decision: commit or back up (not done; out of scope) | Clean tree, or a backup confirmed |
| F1 | P2 | Impact summary checks only the first season | `farmer-inputs.mjs:76` `checks.find` per ruleId; Rotation A only | Rotation A season-1 crop = chickpea + budget | Season 2–3 changes are omitted | Compare all seasons | Every changed season is listed |
| F2 | P2 | Log precedence bug | `backend/scripts/server.mjs:31` `a ?? b === false ? … : …` | Start the backend while MongoDB is down | Misleading console reason | Add parentheses | Log shows the real reason |
| F3 | P2 | Smoke crashes on failure exit | Default-port run: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, exit `0xC0000409` | Smoke against 5174 | Noisy, non-standard exit code | Set `process.exitCode` instead of hard exit | Exit code 1, no assertion |
| F4 | P2 | Snapshot cannot detect data drift | Snapshot `climate` = source/period/url/LST only; `traceFingerprint` = statuses only | Change the budget 150000 → 160000 (both PASS) | Same fingerprint, different numbers | Add `retrieved` and a daily-series hash; include key values | Fingerprint changes when needMm or the budget changes |
| F5 | P2 | Health requires exact counts | `mongo-demo.mjs` `collectionsMatch` | Insert one extra doc | 503, though analysis is fine | Document it, or check minimums | Documented behaviour |
| F6 | P2 | Circular imports | `domain.mjs` ↔ `farmer-inputs.mjs` / `decision-snapshot.mjs` | — | Fragile load order | Move validators out of `domain.mjs` | No cycles |
| F7 | P2 | Legacy `previousCrop` auto-confirmed | `migrateLegacyPreviousCrop` | Import a pre-07F plan | Asserts confirmation the user never gave | Import as unconfirmed | Legacy crop arrives unchecked |

## 4. Scientific integrity verdict: **SOUND ENGINES, PRESENTATION NEEDS CORRECTION**

The engines behave honestly:

- **Missing inputs stay UNKNOWN.** All 12 overall statuses were UNKNOWN before farmer inputs.
- **Mapped crop history is not used.** USDA CDL history (Alfalfa/Corn/Dry Beans) has null `crop_id` and is never consumed.
- **The null stored irrigation budget is never substituted.**
- **An unconfirmed crop selection changes nothing.**
- **Invalid input is blocked.** A budget of −5 shows an error and renders no evaluation.
- **Rule outcomes are plausible.** A confirmed maize-before-wheat gives `rotation.history` WARNING, which is the same-family Poaceae flag, advisory only.

Water magnitudes at plausible spring planting dates are reasonable for a semi-arid site at 1,336 m: maize crop evapotranspiration 699–739 mm and irrigation need 579–601 mm. The defects are in how the science is presented: C1 (provenance labels), C2 (Jan 1 calendar) and C3 (the word "validated").

## 5. Snapshot reproducibility verdict: **NOT REPRODUCIBLE AS A SAVED ARTIFACT**

Within one session, the result is deterministic: the same inputs gave the same fingerprint (`fingerprintStable: true`). Live NASA POWER 2025 currently matches the MongoDB archive exactly: 394.0 mm of rainfall, mean daily maximum 19.08 °C. But as a saved record the snapshot fails:

- it cannot be re-imported (A1);
- it can describe the wrong field (B1);
- it lacks the demo field ID (B2);
- its impact is stale (B3);
- restore never compares it with a new run (B4);
- a version change rejects the whole plan (B5);
- it cannot detect value drift (F4).

## 6. Live backend verdict: **READY on 5178; NOT READY on defaults**

On 5178, MongoDB `fieldshift_demo` passes `/api/health` with `ready:true`. Smoke `smoke:live` passes 20/20 through 5179, with the proxied health identical to direct health. The data matches expectations: canonical ID, 365 LST daily rows for 2025, 3 crop history rows, 26 soils, null irrigation. Non-demo fields query live NASA POWER (verified request and HTTP 200), not MongoDB.

Backend unit tests (12/12) use the canonical fixture; this is labelled in the test names and is **not** a MongoDB success test. The 5174 and 5176 processes were left running untouched.

## 7. UI / demo verdict: **CONDITIONALLY READY**

All 15 journey steps completed on 5179 with zero page errors and zero console errors. The 712 failed requests were all map-tile requests (S3 terrain, EOX imagery) cancelled mid-flight. Observations:

- **Arabic layout works, text does not fully.** The page switches to right-to-left (RTL) correctly, but the farmer and trace text is mixed with English (D1, D2).
- **Mobile at 390 px has no overflow,** and the Plan and Decision lanes are reachable.
- **The 3D issue did not reproduce.** On the demo field, 3D rendered "Real DEM · 1×" terrain in headless Edge (`13-demo-3d.png`, 718 KB of image data). Selecting the demo deliberately forces 2D first. A GPU-driven presenter machine was not tested.
- **Save/restore via local storage works for inputs only.** The previous crop, its confirmation and the budget restore; the results and the MongoDB link do not (B4).
- **Export→Import fails** (A1).

## 8. Verified test results (this session)

| Check | Result |
|---|---|
| `npm run test:local` | **148/148 pass** |
| `npm test --prefix backend` | **12/12 pass** (fixture-based, labelled) |
| `npm run build:local` | PASS (`dist/`, 767,434 B) |
| `npm run qa:browser` | PASS, 9/9 shell checks (does not cover the journey; E2) |
| `smoke:live` (5178/5179) | **PASS 20/20** |
| `smoke:live` (defaults 5174/5173) | FAIL `backend_health_route_exists` (correct detection) + exit crash (F3) |
| `npx vitest run` | **FAIL**, config load error (E1) |
| `npx tsc --noEmit -p tsconfig.json` | **FAIL**, 4 errors in `vite.config.ts` (E1) |
| `npm run build` (vite) | Not run: the tsc step fails, and it would write build output |
| 08A browser journey (temp script, msedge headless, 5179) | 18 steps ran; A1 and B4 reproduced |
| Live probes (temp scripts) | Snapshot size, fingerprint stability, provenance, area, NASA live-vs-archive, version mismatch |

The audit scripts and screenshots are outside the repo, in `%TEMP%\fs-audit-08a\` (`journey.mjs`, `probe.mjs`, `journey.json`, `01`–`13*.png`, `exported-plan.json`).

## 9. Minimal ordered repair plan

1. **A2 (operations, no code).** Present from 5179→5178, or restart 5173 with `FIELDSHIFT_API_PORT=5178` from its owning terminal. Run `smoke:live` against the presented URL.
2. **A1.** Raise the import limit, or compact the exported snapshot.
3. **B1, B2, B3.** Clear the snapshot and traces on field or input change; use `field._id`; build the snapshot after the impact update.
4. **E1.** Correct the `vite.config.ts` import and add node types.
5. **D1, D2.** Revert the Arabic string; localize the impact details and status tokens; hide code identifiers.
6. **C1, C3, C2.** Correct the provenance labels and area wording; label the demo planting dates.
7. **B5, B4.** Make version-tolerant restore and run the snapshot comparison after re-analysis.
8. **E2.** Add the 08A journey to `qa:browser`.
9. **E3.** The user decides whether to commit or back up.
10. **P2 items.** After the presentation.
