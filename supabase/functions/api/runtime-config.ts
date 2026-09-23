export interface RuntimeConfig {
  readonly databaseUrl: string;
  readonly releaseSha: string;
  readonly webOrigin: string;
  readonly googleDriveFolderId: string;
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly googleRefreshToken: string;
  readonly readinessTimeoutMs?: number;
}

export interface EnvReader {
  get(name: string): string | undefined;
}

function required(env: EnvReader, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new Error(`Missing required runtime configuration: ${name}.`);
  return value;
}

function httpsOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PORTFOLIO_WEB_ORIGIN must be an absolute URL origin.');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('PORTFOLIO_WEB_ORIGIN must use HTTPS outside local development.');
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('PORTFOLIO_WEB_ORIGIN must contain only scheme, host and optional port.');
  }
  return url.origin;
}

function optionalPositiveInteger(env: EnvReader, name: string): number | undefined {
  const raw = env.get(name)?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function readRuntimeConfig(env: EnvReader): RuntimeConfig {
  return {
    databaseUrl: required(env, 'SUPABASE_DB_URL'),
    releaseSha: required(env, 'PORTFOLIO_RELEASE_SHA'),
    webOrigin: httpsOrigin(required(env, 'PORTFOLIO_WEB_ORIGIN')),
    googleDriveFolderId: required(env, 'PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID'),
    googleClientId: required(env, 'PORTFOLIO_GOOGLE_CLIENT_ID'),
    googleClientSecret: required(env, 'PORTFOLIO_GOOGLE_CLIENT_SECRET'),
    googleRefreshToken: required(env, 'PORTFOLIO_GOOGLE_REFRESH_TOKEN'),
    ...(optionalPositiveInteger(env, 'PORTFOLIO_READINESS_TIMEOUT_MS') === undefined
      ? {}
      : {
          readinessTimeoutMs: optionalPositiveInteger(
            env,
            'PORTFOLIO_READINESS_TIMEOUT_MS',
          ),
        }),
  };
}
