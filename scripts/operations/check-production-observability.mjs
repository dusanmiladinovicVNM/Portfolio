import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_WINDOW_MINUTES = 20;
const DEFAULT_THRESHOLDS = Object.freeze({
  generic5xx: 3,
  unexpectedErrors: 1,
  storageFailures: 1,
  rateLimitExceeded: 10,
  authFailures: 20,
});

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of ['result', 'data', 'rows']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = rowsFromPayload(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function numericField(row, name) {
  const value = row?.[name];
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid log aggregate ${name}: ${String(value)}`);
  }
  return parsed;
}

function evaluateSignals({ readyOk, counts, thresholds }) {
  const alerts = [];

  if (!readyOk) alerts.push('readiness probe failed');
  if (counts.unexpectedErrors >= thresholds.unexpectedErrors) {
    alerts.push(`unexpected errors ${counts.unexpectedErrors} >= ${thresholds.unexpectedErrors}`);
  }
  if (counts.storageFailures >= thresholds.storageFailures) {
    alerts.push(`storage/reconciliation failures ${counts.storageFailures} >= ${thresholds.storageFailures}`);
  }
  if (counts.generic5xx >= thresholds.generic5xx) {
    alerts.push(`5xx responses ${counts.generic5xx} >= ${thresholds.generic5xx}`);
  }
  if (counts.rateLimitExceeded >= thresholds.rateLimitExceeded) {
    alerts.push(`rate-limit responses ${counts.rateLimitExceeded} >= ${thresholds.rateLimitExceeded}`);
  }
  if (counts.authFailures >= thresholds.authFailures) {
    alerts.push(`authentication failures ${counts.authFailures} >= ${thresholds.authFailures}`);
  }

  return alerts;
}

async function probeReadiness(apiBaseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/health/ready`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.status === 200 && body?.status === 'ready',
      status: response.status,
      releaseSha: typeof body?.version === 'string' ? body.version : null,
      service: typeof body?.service === 'string' ? body.service : null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      releaseSha: null,
      service: null,
      error: error instanceof Error ? error.name : 'UnknownError',
    };
  } finally {
    clearTimeout(timer);
  }
}

function logAggregateSql(windowMinutes) {
  return `
select
  countIf(
    source = 'function_edge_logs'
    and startsWith(
      log_attributes['request.pathname'],
      '/functions/v1/api'
    )
    and toInt32OrZero(
      log_attributes['response.status_code']
    ) between 500 and 599
  ) as generic_5xx,
  countIf(
    source = 'function_logs'
    and event_message like '%"event":"http.unexpected_error"%'
  ) as unexpected_errors,
  countIf(
    source = 'function_logs'
    and (
      event_message like '%"errorCode":"DOCUMENT_STORAGE_%'
      or event_message like '%"errorCode":"DOCUMENT_BINARY_INTEGRITY_MISMATCH"%'
      or event_message like '%"errorCode":"DOCUMENT_BINARY_MISSING"%'
      or event_message like '%"errorCode":"INSPECTION_BINARY_RECONCILIATION_REQUIRED"%'
      or event_message like '%"errorCode":"INSPECTION_FINAL_REPORT_RECONCILIATION_REQUIRED"%'
    )
  ) as storage_failures,
  countIf(
    source = 'function_logs'
    and event_message like '%"status":429%'
    and event_message like '%"errorCode":"RATE_LIMIT_EXCEEDED"%'
  ) as rate_limit_exceeded,
  countIf(
    source = 'function_logs'
    and event_message like '%"status":401%'
  ) as auth_failures
from logs
where timestamp >= now() - INTERVAL ${windowMinutes} MINUTE
  and timestamp <= now()
  `;
}

async function queryLogAggregates({ projectRef, accessToken, windowMinutes }) {
  const now = new Date();
  const start = new Date(now.getTime() - windowMinutes * 60_000);
  const url = new URL(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs`);
  url.searchParams.set('sql', logAggregateSql(windowMinutes));
  url.searchParams.set('iso_timestamp_start', start.toISOString());
  url.searchParams.set('iso_timestamp_end', now.toISOString());

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase logs query failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const rows = rowsFromPayload(payload);
  if (rows.length !== 1) {
    throw new Error(`Supabase logs query returned ${rows.length} aggregate rows; expected 1.`);
  }

  const row = rows[0];
  return {
    generic5xx: numericField(row, 'generic_5xx'),
    unexpectedErrors: numericField(row, 'unexpected_errors'),
    storageFailures: numericField(row, 'storage_failures'),
    rateLimitExceeded: numericField(row, 'rate_limit_exceeded'),
    authFailures: numericField(row, 'auth_failures'),
  };
}

function markdownSummary({ checkedAt, windowMinutes, readiness, counts, thresholds, alerts }) {
  const state = alerts.length === 0 ? 'HEALTHY' : 'ALERT';
  return [
    `# Portfolio production observability — ${state}`,
    '',
    `Checked at: ${checkedAt}`,
    `Window: last ${windowMinutes} minutes`,
    '',
    '## Availability',
    '',
    `- /health/ready: ${readiness.ok ? 'PASS' : 'FAIL'}${readiness.status === null ? '' : ` (HTTP ${readiness.status})`}`,
    `- deployed API release: ${readiness.releaseSha ?? 'unknown'}`,
    '',
    '## Aggregated production signals',
    '',
    `- 5xx responses: ${counts.generic5xx} / alert at ${thresholds.generic5xx}`,
    `- unexpected errors: ${counts.unexpectedErrors} / alert at ${thresholds.unexpectedErrors}`,
    `- storage/reconciliation failures: ${counts.storageFailures} / alert at ${thresholds.storageFailures}`,
    `- RATE_LIMIT_EXCEEDED: ${counts.rateLimitExceeded} / alert at ${thresholds.rateLimitExceeded}`,
    `- HTTP 401: ${counts.authFailures} / alert at ${thresholds.authFailures}`,
    '',
    '## Decision',
    '',
    ...(alerts.length === 0 ? ['No production alert thresholds were crossed.'] : alerts.map((alert) => `- ${alert}`)),
    '',
    'This report contains aggregate counts only; raw production log events are not copied into GitHub.',
    '',
  ].join('\n');
}

async function writeReport(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function selfTest() {
  assert.deepEqual(rowsFromPayload([{ generic_5xx: '2' }]), [{ generic_5xx: '2' }]);
  assert.deepEqual(rowsFromPayload({ result: [{ generic_5xx: 1 }] }), [{ generic_5xx: 1 }]);
  assert.deepEqual(
    evaluateSignals({
      readyOk: true,
      counts: { generic5xx: 2, unexpectedErrors: 0, storageFailures: 0, rateLimitExceeded: 9, authFailures: 19 },
      thresholds: DEFAULT_THRESHOLDS,
    }),
    [],
  );
  assert.deepEqual(
    evaluateSignals({
      readyOk: false,
      counts: { generic5xx: 3, unexpectedErrors: 1, storageFailures: 1, rateLimitExceeded: 10, authFailures: 20 },
      thresholds: DEFAULT_THRESHOLDS,
    }),
    [
      'readiness probe failed',
      'unexpected errors 1 >= 1',
      'storage/reconciliation failures 1 >= 1',
      '5xx responses 3 >= 3',
      'rate-limit responses 10 >= 10',
      'authentication failures 20 >= 20',
    ],
  );
  const sql = logAggregateSql(20);
  assert.match(sql, /source = 'function_edge_logs'/);
  assert.match(sql, /request\.pathname/);
  assert.match(sql, /response\.status_code/);
  assert.match(sql, /between 500 and 599/);
  assert.match(sql, /source = 'function_logs'/);
  assert.match(sql, /RATE_LIMIT_EXCEEDED/);
  assert.match(sql, /INTERVAL 20 MINUTE/);
  console.log('Production observability self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_OBSERVABILITY_ACCESS_TOKEN;
  const apiBaseUrl = process.env.PORTFOLIO_PRODUCTION_API_BASE_URL;
  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF is required.');
  if (!accessToken) throw new Error('SUPABASE_OBSERVABILITY_ACCESS_TOKEN is required.');
  if (!apiBaseUrl) throw new Error('PORTFOLIO_PRODUCTION_API_BASE_URL is required.');

  const windowMinutes = positiveInteger(process.env.OBSERVABILITY_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES, 'OBSERVABILITY_WINDOW_MINUTES');
  const thresholds = {
    generic5xx: positiveInteger(process.env.ALERT_GENERIC_5XX, DEFAULT_THRESHOLDS.generic5xx, 'ALERT_GENERIC_5XX'),
    unexpectedErrors: positiveInteger(process.env.ALERT_UNEXPECTED_ERRORS, DEFAULT_THRESHOLDS.unexpectedErrors, 'ALERT_UNEXPECTED_ERRORS'),
    storageFailures: positiveInteger(process.env.ALERT_STORAGE_FAILURES, DEFAULT_THRESHOLDS.storageFailures, 'ALERT_STORAGE_FAILURES'),
    rateLimitExceeded: positiveInteger(process.env.ALERT_RATE_LIMIT_EXCEEDED, DEFAULT_THRESHOLDS.rateLimitExceeded, 'ALERT_RATE_LIMIT_EXCEEDED'),
    authFailures: positiveInteger(process.env.ALERT_AUTH_FAILURES, DEFAULT_THRESHOLDS.authFailures, 'ALERT_AUTH_FAILURES'),
  };

  const readiness = await probeReadiness(apiBaseUrl);
  let counts;
  let monitorError = null;
  try {
    counts = await queryLogAggregates({ projectRef, accessToken, windowMinutes });
  } catch (error) {
    monitorError = error instanceof Error ? error.message : 'Unknown monitoring error';
    counts = { generic5xx: 0, unexpectedErrors: 0, storageFailures: 0, rateLimitExceeded: 0, authFailures: 0 };
  }

  const alerts = monitorError
    ? [`monitoring logs query unavailable: ${monitorError}`]
    : evaluateSignals({ readyOk: readiness.ok, counts, thresholds });
  if (monitorError && !readiness.ok) alerts.unshift('readiness probe failed');

  const checkedAt = new Date().toISOString();
  const report = { checkedAt, windowMinutes, readiness, counts, thresholds, alerts };
  const summary = markdownSummary(report);
  const jsonPath = process.env.OBSERVABILITY_JSON_PATH ?? '.artifacts/observability/result.json';
  const summaryPath = process.env.OBSERVABILITY_SUMMARY_PATH ?? '.artifacts/observability/summary.md';
  await writeReport(jsonPath, JSON.stringify(report, null, 2) + '\n');
  await writeReport(summaryPath, summary);
  console.log(summary);

  if (alerts.length > 0) process.exitCode = 1;
}

await main();
