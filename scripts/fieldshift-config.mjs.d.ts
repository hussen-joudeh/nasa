export const DEFAULT_API_HOST: string;
export const DEFAULT_API_PORT: number;
export const DEFAULT_FRONTEND_PORT: number;
export const DEFAULT_MONGODB_URI: string;
export const DEFAULT_MONGODB_DATABASE: string;
export const CANONICAL_COLLECTION_COUNTS: Record<string, number>;

export function resolveApiPort(env?: NodeJS.ProcessEnv): number;
export function resolveApiTarget(env?: NodeJS.ProcessEnv): { host: string; port: number; origin: string };
export function resolveMongoUri(env?: NodeJS.ProcessEnv): string;
export function resolveMongoDatabase(env?: NodeJS.ProcessEnv): string;
export function classifyHealthBody(
  status: number,
  body: Record<string, unknown>,
  rawText?: string,
): { contract: string; ready?: boolean; status?: number; body?: unknown };
export function probeBackendReadiness(
  origin: string,
  timeoutMs?: number,
): Promise<{
  ok: boolean;
  reason?: string;
  detail?: string;
  origin: string;
  ready?: boolean;
  status?: number;
  body?: unknown;
}>;
export function describeStackTargets(env?: NodeJS.ProcessEnv): {
  api: { host: string; port: number; origin: string };
  frontendOrigin: string;
  configuredApiPort: number;
  frontendPort: number;
};