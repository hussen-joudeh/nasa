# Batch 07E — operational stabilization summary

See project root `DEMO_RUNBOOK_07E.md` for demo steps. Shared configuration lives in `scripts/fieldshift-config.mjs` and `fieldshift.env.example`.

**Ports observed in verification (not killed):** stale API without `/api/health` on **5174**; older 07C API on **5176**; updated readiness API verified on **5178**. Align `PORT` and `FIELDSHIFT_API_PORT`, then restart `npm run dev:local`.

**Health contract:** HTTP 200 only when `ready: true` (Mongo reachable, canonical counts, 365×2025 climate, validation). HTTP 503 otherwise; no credentials in JSON.