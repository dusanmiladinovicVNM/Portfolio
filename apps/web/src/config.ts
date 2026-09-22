export interface WebConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly apiBaseUrl: string;
}

export class WebConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebConfigurationError';
  }
}

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new WebConfigurationError(`Missing required web configuration: ${name}.`);
  }
  return normalized;
}

function jwtRole(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const base64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64)) as unknown;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'role' in payload &&
      typeof (payload as { readonly role?: unknown }).role === 'string'
    ) {
      return (payload as { readonly role: string }).role;
    }
  } catch {
    // Opaque/publishable keys are not JWTs and are allowed below.
  }
  return null;
}

function browserSafeSupabaseKey(value: string | undefined): string {
  const key = required('VITE_SUPABASE_ANON_KEY', value);

  if (key.toLowerCase().startsWith('sb_secret_')) {
    throw new WebConfigurationError(
      'VITE_SUPABASE_ANON_KEY must be a browser-safe anon/publishable key, not a Supabase secret key.',
    );
  }

  const role = jwtRole(key);
  if (role !== null && role !== 'anon') {
    throw new WebConfigurationError(
      `VITE_SUPABASE_ANON_KEY contains a privileged JWT role (${role}) and must not be shipped to the browser.`,
    );
  }

  return key;
}

export function readWebConfig(env: ImportMetaEnv = import.meta.env): WebConfig {
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim() || '/functions/v1/api';

  return {
    supabaseUrl: required('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL),
    supabaseAnonKey: browserSafeSupabaseKey(env.VITE_SUPABASE_ANON_KEY),
    apiBaseUrl: apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl,
  };
}
