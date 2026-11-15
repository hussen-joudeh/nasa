# FieldShift demo operations (Batch 07E, Windows 11 / PowerShell)

## Configuration

Copy `fieldshift.env.example` to `fieldshift.env` (optional). **Backend** reads `PORT`, `MONGODB_URI`, `MONGODB_DATABASE`. **Frontend proxy** reads `FIELDSHIFT_API_PORT` and `FIELDSHIFT_API_HOST`. Both must aim at the **same** live backend.

Load for one session:

```powershell
cd C:\Users\husse\Downloads\field-shift
Get-Content .\fieldshift.env -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
```

Default ports: frontend **5173**, backend **5174**, MongoDB **27017**. If 5174 is an old API without `/api/health`, use e.g. `5176` for **both** `PORT` and `FIELDSHIFT_API_PORT` — do **not** kill unknown protected listeners.

## 1. Check MongoDB

```powershell
npm run mongo:ping --prefix backend
# or wait up to 15s:
npm run check:mongo
```

## 2. Import (once per database)

```powershell
npm run db:import --prefix backend
```

Repeat import stays idempotent (`upserted: 0`).

## 3. Start backend

```powershell
$env:PORT = '5176'   # only if 5174 is stale
npm start --prefix backend
```

Expect: `FieldShift MongoDB API at http://127.0.0.1:…/api/health` and readiness line. **EADDRINUSE** → pick another `PORT` and match `FIELDSHIFT_API_PORT`.

## 4. Start frontend

New terminal, same `fieldshift.env` / env vars:

```powershell
$env:FIELDSHIFT_API_PORT = $env:PORT   # must match backend
npm run dev:local
```

Console shows `API proxy → http://127.0.0.1:<port>`.

## 5. Confirm correct backend

```powershell
curl.exe -s http://127.0.0.1:$env:PORT/api/health | ConvertFrom-Json | Format-List
curl.exe -s http://127.0.0.1:5173/api/health | ConvertFrom-Json | Select-Object ready, fieldId
```

Stale 5174 returns `{"error":"Route not found."}` — proxy then 502 with `Stale or wrong backend`.

Who listens:

```powershell
netstat -ano | findstr "LISTENING" | findstr "5173 5174 5176 27017"
```

## 6. Live smoke test

```powershell
$env:FIELDSHIFT_API_PORT = $env:PORT
npm run smoke:live
```

Writes `qa/evidence/batch07e/smoke-live.json`. **PARTIAL/BLOCKED** if MongoDB or stack is down — not replaced by fixtures.

## 7. Tests and build

```powershell
npm run test:local
npm run build:local
npm test --prefix backend
npm run qa:browser   # requires dev server
```

## Recovery

| Symptom | Action |
|--------|--------|
| MongoDB refused | Start `mongod`; verify `mongo:ping` |
| 503 health | Run `db:import`; check collection counts in health JSON |
| Proxy 502 stale | Align `FIELDSHIFT_API_PORT` with backend that has `/api/health` |
| EADDRINUSE | New `PORT` + matching proxy env; leave old process alone |
| Demo analysis 503 in UI | Same as proxy/backend mismatch |

## Demo readiness checklist

- [ ] `mongo:ping` OK  
- [ ] Direct `/api/health` → `ready: true`, `analysis.ready: true`  
- [ ] Proxied `/api/health` matches direct  
- [ ] `smoke:live` PASS  
- [ ] Non-demo field still uses live NASA POWER (no Mongo fallback)