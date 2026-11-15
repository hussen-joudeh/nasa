import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
  DEFAULT_FRONTEND_PORT,
  describeStackTargets,
  probeBackendReadiness,
  resolveApiTarget,
} from './fieldshift-config.mjs';
import { loadFieldshiftEnv } from './load-fieldshift-env.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function resolveFrontendApiProxyTarget(env=process.env){return resolveApiTarget(env);}
export function createAppServer(){const api=resolveApiTarget();return http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/')){
  if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET','Content-Type':'application/json'});res.end(JSON.stringify({error:'Read-only endpoint'}));return;}
  const upstreamUrl=`${api.origin}${pathname}${new URL(req.url,'http://localhost').search}`;
  try{const upstream=await fetch(upstreamUrl,{signal:AbortSignal.timeout(8000)});const text=await upstream.text();if(pathname==='/api/health'&&upstream.status===404&&text.includes('Route not found')){res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Stale or wrong backend — /api/health missing. Point FIELDSHIFT_API_PORT at the current API (see fieldshift.env.example).',proxyTarget:api.origin}));return;}res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(text);}catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Demo backend unavailable',proxyTarget:api.origin}));}return;
 }
 const allowed=pathname==='/'||pathname==='/index.html'||/^\/src\/[a-zA-Z0-9_-]+\.(mjs|css)$/.test(pathname)||pathname==='/sources.html'||pathname==='/src/assets/cinematic-farmland.webp'||/^\/src\/assets\/brand\/[a-zA-Z0-9_.-]+\.(svg|png|webp)$/.test(pathname)||pathname==='/site.webmanifest';
 if(!allowed){res.writeHead(404);res.end('Not found');return;}
 try{const content=await readFile(path.join(root,pathname==='/'?'index.html':pathname.slice(1)));res.writeHead(200,{'Content-Type':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.png')?'image/png':pathname.endsWith('.webmanifest')?'application/manifest+json':pathname.endsWith('.webp')?'image/webp':pathname.endsWith('.mjs')?'text/javascript; charset=utf-8':pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(content);}catch{res.writeHead(404);res.end('Not found');}
});}

async function startListening() {
  const envFile = loadFieldshiftEnv();
  const stack = describeStackTargets();
  const api = stack.api;
  const port = stack.frontendPort;
  const skipCheck = process.env.FIELDSHIFT_SKIP_BACKEND_CHECK === '1';
  if (envFile.loaded) {
    console.error(`[FieldShift] Loaded ${envFile.path}`);
  } else {
    console.error('[FieldShift] No fieldshift.env — using process env / defaults (see fieldshift.env.example).');
  }
  console.error(`[FieldShift] Frontend target: ${stack.frontendOrigin} (port ${port})`);
  console.error(`[FieldShift] API proxy target: ${api.origin} (PORT/FIELDSHIFT_API_PORT=${stack.configuredApiPort})`);
  if (!skipCheck) {
    const probe = await probeBackendReadiness(api.origin);
    if (!probe.ok) {
      console.error(`[FieldShift] Backend misaligned at ${api.origin}: ${probe.reason} — ${probe.detail}`);
      console.error('[FieldShift] Set PORT and FIELDSHIFT_API_PORT to the same live backend, or use FIELDSHIFT_SKIP_BACKEND_CHECK=1 for UI-only work.');
      process.exitCode = 1;
      return;
    }
    const readiness = probe.ready ? 'demo analysis ready' : `not ready (HTTP ${probe.status})`;
    console.error(`[FieldShift] Backend contract OK; ${readiness}.`);
  } else {
    console.error('[FieldShift] Backend contract check skipped (FIELDSHIFT_SKIP_BACKEND_CHECK=1).');
  }
  createAppServer().listen(port, '127.0.0.1', () => {
    console.log(`Field Shift: http://127.0.0.1:${port} (API proxy → ${api.origin})`);
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startListening().catch((err)=>{
    console.error('[FieldShift] Startup failed:', err?.message ?? err);
    process.exitCode = 1;
  });
}