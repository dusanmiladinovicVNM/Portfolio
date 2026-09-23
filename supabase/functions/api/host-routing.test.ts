import {
  isSupabasePublicHealthPath,
  SUPABASE_FUNCTION_BASE_PATH,
  supabaseRelativePortfolioPath,
} from './host-routing.ts';

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('Supabase runtime base path exposes unauthenticated health routes', () => {
  assertEquals(SUPABASE_FUNCTION_BASE_PATH, '/api', 'base path');
  assertEquals(
    isSupabasePublicHealthPath('/api/health/live'),
    true,
    'health/live public',
  );
  assertEquals(
    isSupabasePublicHealthPath('/functions/v1/api/health/live'),
    false,
    'external gateway path is not runtime path',
  );
});

Deno.test('Supabase runtime base path maps business paths into Portfolio routing', () => {
  assertEquals(
    supabaseRelativePortfolioPath('/api/properties'),
    '/properties',
    'properties route',
  );
  assertEquals(
    supabaseRelativePortfolioPath('/api'),
    '/',
    'function root',
  );
  assertEquals(
    supabaseRelativePortfolioPath('/functions/v1/api/properties'),
    null,
    'external gateway path must not be treated as runtime path',
  );
});
