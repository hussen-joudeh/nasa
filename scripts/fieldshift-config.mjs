/** Shared local stack configuration (no secrets). Backend and frontend both import this file. */
export const DEFAULT_API_HOST = '127.0.0.1';
export const DEFAULT_API_PORT = 5174;
export const DEFAULT_FRONTEND_PORT = 5173;
export const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017';
export const DEFAULT_MONGODB_DATABASE = 'fieldshift_demo';

export const CANONICAL_COLLECTION_COUNTS = {
  fields: 1,
  climate_daily: 1096,
  climate_seasonal: 2,
  crop_history: 3,
  field_soils: 26,
  crop_profiles: 8,
  scenarios: 2,
};

export function resolveApiPort(env = process.env) {
  return Number(env.PORT ?? env.FIELDSHIFT_API_PORT ?? DEFAULT_API_PORT);
}

export function resolveApiTarget(env = process.env) {
  const host = env.FIELDSHIFT_API_HOST ?? DEFAULT_API_HOST;
  const port = resolveApiPort(env);
  return { host, port, origin: `http://${host}:${port}` };
}

export function resolveMongoUri(env = process.env) {
  return env.MONGODB_URI ?? DEFAULT_MONGODB_URI;
}

export function resolveMongoDatabase(env = process.env) {
  return env.MONGODB_DATABASE ?? DEFAULT_MONGODB_DATABASE;
}

/** Parse /api/health and detect stale 07C-era APIs missing the 07E readiness contract. */
export function classifyHealthBody(status, body, rawText = '') {
  if (status === 404) return { contract: 'missing_route', ready: false };
  if (typeof body?.error === 'string' && body.error.includes('Route not found')) {
    return { contract: 'missing_route', ready: false };
  }
  if (rawText.includes('Route not found') && status >= 400) {
    return { contract: 'missing_route', ready: false };
  }
  const hasReadinessContract =
    body?.http === true &&
    body?.mongodb !== undefined &&
    body?.evidence !== undefined &&
    body?.analysis !== undefined;
  if (!hasReadinessContract) return { contract: 'legacy', ready: false };
  return { contract: 'current', ready: body.ready === true, status, body };
}

export async function probeBackendReadiness(origin, timeoutMs = 8000) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw: raw.slice(0, 200) };
    }
    const classified = classifyHealthBody(response.status, body, raw);
    if (classified.contract === 'missing_route') {
      return {
        ok: false,
        reason: 'stale_api',
        detail: 'GET /api/health is missing (stale or wrong backend process on this port).',
        origin,
      };
    }
    if (classified.contract === 'legacy') {
      return {
        ok: false,
        reason: 'legacy_health',
        detail: 'Health JSON lacks 07E readiness fields (http/mongodb/evidence/analysis).',
        origin,
      };
    }
    return {
      ok: true,
      ready: classified.ready === true,
      status: response.status,
      body,
      origin,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: err?.message ?? 'fetch failed',
      origin,
    };
  }
}

export function describeStackTargets(env = process.env) {
  const api = resolveApiTarget(env);
  const frontendPort = Number(env.FIELDSHIFT_FRONTEND_PORT ?? DEFAULT_FRONTEND_PORT);
  return {
    api,
    frontendOrigin: `http://${DEFAULT_API_HOST}:${frontendPort}`,
    configuredApiPort: resolveApiPort(env),
    frontendPort,
  };
}