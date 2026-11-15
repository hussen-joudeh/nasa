# Visual V4A recoverable baseline

Pre-V4A map terrain lifecycle lives in `src/app.mjs` (`initMap`, `requestTerrain`, `toggleTerrain`, `composeMode`, `switchLayer`) and camera helpers in `src/map-explorer.mjs`.

```bash
git log -1 --oneline -- src/app.mjs src/map-explorer.mjs
```

Scientific engines are unchanged for this batch.

Evidence: `qa/visual-v4a/screenshots/` and `qa/visual-v4a/diagnostic-report.json` via `npm run qa:visual-v4a`.