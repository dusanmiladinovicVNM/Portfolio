import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

export type ApiRateLimitScope =
  | 'authenticated'
  | 'write'
  | 'binary-upload'
  | 'final-report';

export interface ApiRateLimitRule {
  readonly scope: ApiRateLimitScope;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface ApiRateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  readonly scope?: ApiRateLimitScope;
}

interface RateLimitRow {
  request_count: number;
  retry_after_seconds: number;
}

const AUTHENTICATED_RULE: ApiRateLimitRule = Object.freeze({
  scope: 'authenticated',
  limit: 180,
  windowSeconds: 60,
});

const WRITE_RULE: ApiRateLimitRule = Object.freeze({
  scope: 'write',
  limit: 60,
  windowSeconds: 60,
});

const BINARY_UPLOAD_RULE: ApiRateLimitRule = Object.freeze({
  scope: 'binary-upload',
  limit: 12,
  windowSeconds: 60,
});

const FINAL_REPORT_RULE: ApiRateLimitRule = Object.freeze({
  scope: 'final-report',
  limit: 6,
  windowSeconds: 60,
});

function isWriteMethod(method: string): boolean {
  return (
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE'
  );
}

function isBinaryUpload(method: string, path: string): boolean {
  if (method !== 'POST') return false;
  return (
    /\/documents\/[^/]+\/versions$/.test(path) ||
    /\/inspections\/[^/]+\/binaries$/.test(path)
  );
}

function isFinalReport(method: string, path: string): boolean {
  return (
    method === 'POST' &&
    /\/inspections\/[^/]+\/final-report$/.test(path)
  );
}

export function apiRateLimitRules(
  request: Pick<Request, 'method' | 'url'>,
): readonly ApiRateLimitRule[] {
  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;
  const rules: ApiRateLimitRule[] = [AUTHENTICATED_RULE];

  if (isWriteMethod(method)) rules.push(WRITE_RULE);
  if (isBinaryUpload(method, path)) rules.push(BINARY_UPLOAD_RULE);
  if (isFinalReport(method, path)) rules.push(FINAL_REPORT_RULE);

  return rules;
}

export class PostgresApiRateLimiter {
  constructor(private readonly sql: Sql) {}

  async consume(
    rateKey: string,
    request: Pick<Request, 'method' | 'url'>,
  ): Promise<ApiRateLimitDecision> {
    const rules = apiRateLimitRules(request);
    let rejectedScope: ApiRateLimitScope | undefined;
    let retryAfterSeconds = 0;

    await this.sql.begin(async (tx) => {
      for (const rule of rules) {
        const rows = await tx<RateLimitRow[]>`
          insert into public.api_rate_limit_buckets (
            rate_key,
            scope,
            window_started_at,
            request_count,
            updated_at
          )
          values (
            ${rateKey},
            ${rule.scope},
            statement_timestamp(),
            1,
            statement_timestamp()
          )
          on conflict (rate_key, scope) do update
          set
            request_count = case
              when public.api_rate_limit_buckets.window_started_at
                + make_interval(secs => ${rule.windowSeconds})
                <= statement_timestamp()
                then 1
              else public.api_rate_limit_buckets.request_count + 1
            end,
            window_started_at = case
              when public.api_rate_limit_buckets.window_started_at
                + make_interval(secs => ${rule.windowSeconds})
                <= statement_timestamp()
                then statement_timestamp()
              else public.api_rate_limit_buckets.window_started_at
            end,
            updated_at = statement_timestamp()
          returning
            request_count,
            greatest(
              1,
              ceil(
                extract(
                  epoch from (
                    window_started_at
                    + make_interval(secs => ${rule.windowSeconds})
                    - statement_timestamp()
                  )
                )
              )::integer
            ) as retry_after_seconds
        `;

        const row = rows[0];
        if (!row) throw new Error('Rate-limit counter update returned no row.');

        if (row.request_count > rule.limit) {
          rejectedScope ??= rule.scope;
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            row.retry_after_seconds,
          );
        }
      }
    });

    return rejectedScope
      ? {
          allowed: false,
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
          scope: rejectedScope,
        }
      : { allowed: true, retryAfterSeconds: 0 };
  }
}
