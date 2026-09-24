import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresApiRateLimiter } from '../src/api-rate-limit.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for API integration tests.');
}

const sql = postgres(connectionString, { max: 10 });
const limiter = new PostgresApiRateLimiter(sql);

function request(method: string, path: string): Request {
  return new Request('https://example.test/functions/v1/api' + path, {
    method,
  });
}

async function row(rateKey: string, scope: string) {
  const rows = await sql<{
    request_count: number;
  }[]>`
    select request_count
    from public.api_rate_limit_buckets
    where rate_key = ${rateKey}
      and scope = ${scope}
  `;
  return rows[0] ?? null;
}

beforeAll(async () => {
  await sql`drop table if exists public.api_rate_limit_buckets cascade`;
  const migration = await readFile(
    new URL(
      '../../../supabase/migrations/20260924112000_api_rate_limits.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await sql.unsafe(migration);
});

afterAll(async () => {
  await sql`drop table if exists public.api_rate_limit_buckets cascade`;
  await sql.end();
});

describe('PostgresApiRateLimiter integration', () => {
  it('allows exactly six concurrent final-report requests and rejects the seventh', async () => {
    const rateKey = 'supabase:integration-final-report';
    const finalReport = request(
      'POST',
      '/inspections/00000000-0000-4000-8000-000000000001/final-report',
    );

    const decisions = await Promise.all(
      Array.from({ length: 7 }, () => limiter.consume(rateKey, finalReport)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(6);
    const rejected = decisions.filter((decision) => !decision.allowed);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      allowed: false,
      scope: 'final-report',
    });
    expect(rejected[0]?.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    expect(await row(rateKey, 'authenticated')).toEqual({
      request_count: 7,
    });
    expect(await row(rateKey, 'write')).toEqual({
      request_count: 7,
    });
    expect(await row(rateKey, 'final-report')).toEqual({
      request_count: 7,
    });
  });

  it('allows exactly sixty concurrent writes and rejects the sixty-first', async () => {
    const rateKey = 'supabase:integration-write';
    const writeRequest = request(
      'PATCH',
      '/inspections/00000000-0000-4000-8000-000000000002/sections/general',
    );

    const decisions = await Promise.all(
      Array.from({ length: 61 }, () => limiter.consume(rateKey, writeRequest)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(60);
    const rejected = decisions.filter((decision) => !decision.allowed);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      allowed: false,
      scope: 'write',
    });

    expect(await row(rateKey, 'authenticated')).toEqual({
      request_count: 61,
    });
    expect(await row(rateKey, 'write')).toEqual({
      request_count: 61,
    });
  });

  it('resets an expired fixed window to request count one', async () => {
    const rateKey = 'supabase:integration-reset';
    const finalReport = request(
      'POST',
      '/inspections/00000000-0000-4000-8000-000000000003/final-report',
    );

    await Promise.all(
      Array.from({ length: 7 }, () => limiter.consume(rateKey, finalReport)),
    );

    await sql`
      update public.api_rate_limit_buckets
      set window_started_at = statement_timestamp() - interval '61 seconds'
      where rate_key = ${rateKey}
        and scope = 'final-report'
    `;

    const decision = await limiter.consume(rateKey, finalReport);

    expect(decision.allowed).toBe(true);
    expect(await row(rateKey, 'final-report')).toEqual({
      request_count: 1,
    });
  });
});
