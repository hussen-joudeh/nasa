# Visual V3B recoverable baseline

Pre-V3B Preflight results UI lived in `src/preflight-view.mjs` as an inline per-rule checklist without the hub, rotation strip, grouped checks, or shared provenance drawer.

To diff the presentation layer:

```bash
git log -1 --oneline -- src/preflight-view.mjs
git show HEAD~N:src/preflight-view.mjs   # pick commit before Visual V3B
```

Scientific engines and `src/preflight.mjs` are unchanged for this batch.

Evidence for V3B ships under `qa/visual-v3b/screenshots/` via `npm run qa:visual-v3b` (requires local stack on port 5179).