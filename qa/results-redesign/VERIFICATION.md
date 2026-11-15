# Results dashboard verification

Verified on 15 November 2026 against the production build at `http://127.0.0.1:4181/`, using the connected MongoDB demo API and headless Microsoft Edge.

The four dashboard tabs show one panel at a time and start on Overview after each comparison. The shared header preserves the selected field and budget amount, unit and scope. Arabic dates retain their left-to-right order without splitting a date across lines.

## Browser coverage

All four sessions passed: English and Arabic at 1440 × 900 and 375 × 812. See [browser-results.json](browser-results.json) for engine evidence and session results. The adjacent PNGs capture each state and expanded field-data section.

- Blank budget, with missing model inputs: incomplete comparison, Enter irrigation budget, no empty chart.
- 600 mm, with missing model inputs: budget remains visible, comparison remains incomplete, Review season inputs.
- Complete 600 mm illustrative demo: Season 2 statuses match engine output: A PASS, B WARNING, C WARNING. Chart requirements match the engine values.
- Blank budget with calculable requirements: chart remains available and omits the budget reference line.
- Partly calculable requirements: chart remains available and labels the unsupported plan unavailable.
- Editing the plans and rerunning at 620 mm updates the outputs and reopens Overview. Returning to setup preserves the field and edited plans.
- Cubic-metre and whole-plan budget settings survive the results/setup round trip.
- Arrow keys, Home, End and Tab operate the tab list and panel; recovery actions reveal and focus the relevant setup input. Edit comparison focuses the setup heading. Escape closes a check's evidence drawer and restores its trigger focus.
- Only one comparison explanation stays expanded. Overall assessments remain separate from Season 2 water statuses.
- Map, historical climate, all three crop-history records and all 26 soil records remain accessible, alongside source metadata. Check groups, season breakdown, sensitivity, decision traces, citations, climate scenarios and saved-plan controls remain reachable.
- No page JavaScript errors or horizontal page overflow occurred in these sessions.

## Automated checks

| Command | Result |
| --- | --- |
| `npm run test:local` | 212 passed |
| `npm test` | 7 passed |
| `npm test` in `backend/` | 12 passed |
| `npm run build` | Passed, including TypeScript checks |

The backend hash check initially found CRLF line endings in the working copy of its canonical GeoJSON. Its LF bytes were restored from Git HEAD after verifying they match the published manifest hash; its content, manifest and database records were unchanged. The backend suite then passed.

To repeat browser verification with the API connected:

```powershell
$env:FIELDSHIFT_QA_URL='http://127.0.0.1:4181/'
node scripts/qa-results-dashboard.mjs
```

Verification used browser viewport emulation; physical mobile devices and screen-reader software were not tested.
