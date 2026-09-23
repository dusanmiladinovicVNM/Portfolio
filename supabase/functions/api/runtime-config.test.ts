import { readRuntimeConfig, type EnvReader } from './runtime-config.ts';

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function env(values: Record<string, string>): EnvReader {
  return { get: (name) => values[name] };
}

const base = {
  SUPABASE_DB_URL: 'postgresql://example',
  PORTFOLIO_RELEASE_SHA: 'abc123',
  PORTFOLIO_WEB_ORIGIN: 'https://portfolio.example.com',
  PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID: 'folder-1',
  PORTFOLIO_GOOGLE_CLIENT_ID: 'client-id',
  PORTFOLIO_GOOGLE_CLIENT_SECRET: 'client-secret',
  PORTFOLIO_GOOGLE_REFRESH_TOKEN: 'refresh-token',
};

Deno.test('runtime config requires production dependencies and normalizes web origin', () => {
  const config = readRuntimeConfig(
    env({
      ...base,
      PORTFOLIO_WEB_ORIGIN: 'https://portfolio.example.com/',
      PORTFOLIO_READINESS_TIMEOUT_MS: '1500',
    }),
  );

  assertEquals(config.webOrigin, 'https://portfolio.example.com', 'web origin');
  assertEquals(config.readinessTimeoutMs, 1500, 'readiness timeout');
});

Deno.test('runtime config rejects non-HTTPS remote web origins', () => {
  let message = '';
  try {
    readRuntimeConfig(
      env({ ...base, PORTFOLIO_WEB_ORIGIN: 'http://portfolio.example.com' }),
    );
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (!message.includes('must use HTTPS')) {
    throw new Error(`Expected HTTPS rejection, got: ${message}`);
  }
});
