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

export function readWebConfig(env: ImportMetaEnv = import.meta.env): WebConfig {
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim() || '/functions/v1/api';

  return {
    supabaseUrl: required('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL),
    supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY),
    apiBaseUrl: apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl,
  };
}
