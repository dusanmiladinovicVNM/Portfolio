import { createCorsHandler } from './cors.ts';

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('CORS permits only configured browser origin', async () => {
  const handler = createCorsHandler(
    'https://portfolio.example.com',
    async () => Response.json({ ok: true }),
  );

  const allowed = await handler(
    new Request('https://api.example.com/functions/v1/api/health/live', {
      headers: { origin: 'https://portfolio.example.com' },
    }),
  );
  assertEquals(allowed.status, 200, 'allowed status');
  assertEquals(
    allowed.headers.get('access-control-allow-origin'),
    'https://portfolio.example.com',
    'allow origin',
  );

  const denied = await handler(
    new Request('https://api.example.com/functions/v1/api/properties', {
      headers: { origin: 'https://evil.example.com' },
    }),
  );
  assertEquals(denied.status, 403, 'denied status');
  assertEquals(
    denied.headers.get('access-control-allow-origin'),
    null,
    'denied CORS header',
  );
});

Deno.test('CORS answers configured preflight without invoking business handler', async () => {
  let calls = 0;
  const handler = createCorsHandler(
    'https://portfolio.example.com',
    async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    },
  );

  const response = await handler(
    new Request('https://api.example.com/functions/v1/api/properties', {
      method: 'OPTIONS',
      headers: { origin: 'https://portfolio.example.com' },
    }),
  );

  assertEquals(response.status, 204, 'preflight status');
  assertEquals(calls, 0, 'business calls');
  assertEquals(
    response.headers.get('access-control-allow-methods'),
    'GET,POST,PATCH,OPTIONS',
    'allowed methods',
  );
});
