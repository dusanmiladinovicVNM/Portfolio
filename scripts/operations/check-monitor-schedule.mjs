import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// This is retrospective evidence of a scheduling gap, NOT an independent
// watchdog. It only runs when GitHub Actions actually starts a workflow.
const DEFAULT_MAX_GAP_MINUTES = 45;

function positiveInt(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(name + ' must be a positive integer.');
  }
  return parsed;
}

function safeTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function evaluateScheduledCadence(runs, currentRunId, maxGapMinutes) {
  if (!Array.isArray(runs)) throw new Error('Workflow runs must be an array.');
  const scheduled = runs
    .filter((item) => item?.event === 'schedule' && safeTimestamp(item.created_at) !== null)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const current = scheduled.find((item) => String(item.id) === String(currentRunId));
  if (!current) {
    return { ok: false, reason: 'CURRENT_SCHEDULED_RUN_NOT_FOUND', maxGapMinutes };
  }
  const previous = scheduled.find(
    (item) => item.id !== current.id && Date.parse(item.created_at) < Date.parse(current.created_at),
  );
  if (!previous) {
    return {
      ok: false,
      reason: 'PREVIOUS_SCHEDULED_RUN_NOT_FOUND',
      currentRunId: current.id,
      currentStartedAt: current.created_at,
      maxGapMinutes,
    };
  }
  const gapMinutes = (Date.parse(current.created_at) - Date.parse(previous.created_at)) / 60_000;
  return {
    ok: gapMinutes <= maxGapMinutes,
    reason: gapMinutes <= maxGapMinutes ? 'CADENCE_OBSERVED_WITHIN_BOUND' : 'SCHEDULED_MONITOR_GAP',
    currentRunId: current.id,
    previousRunId: previous.id,
    currentStartedAt: current.created_at,
    previousStartedAt: previous.created_at,
    gapMinutes,
    maxGapMinutes,
  };
}

function selfTest() {
  const runs = [
    { id: 3, event: 'schedule', created_at: '2026-11-19T12:30:00Z' },
    { id: 2, event: 'schedule', created_at: '2026-11-19T12:15:00Z' },
    { id: 1, event: 'schedule', created_at: '2026-11-19T12:00:00Z' },
    { id: 8, event: 'workflow_dispatch', created_at: '2026-11-19T12:29:00Z' },
  ];
  assert.deepEqual(
    evaluateScheduledCadence(runs, 3, 45),
    {
      ok: true,
      reason: 'CADENCE_OBSERVED_WITHIN_BOUND',
      currentRunId: 3,
      previousRunId: 2,
      currentStartedAt: '2026-11-19T12:30:00Z',
      previousStartedAt: '2026-11-19T12:15:00Z',
      gapMinutes: 15,
      maxGapMinutes: 45,
    },
  );
  const late = evaluateScheduledCadence(
    [runs[0], { ...runs[1], created_at: '2026-11-19T06:15:00Z' }],
    3,
    45,
  );
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'SCHEDULED_MONITOR_GAP');
  assert.equal(late.gapMinutes, 375);
  assert.equal(
    evaluateScheduledCadence(runs, 999, 45).reason,
    'CURRENT_SCHEDULED_RUN_NOT_FOUND',
  );
  assert.equal(
    evaluateScheduledCadence([runs[0]], 3, 45).reason,
    'PREVIOUS_SCHEDULED_RUN_NOT_FOUND',
  );
  assert.equal(positiveInt('45', 20, 'threshold'), 45);
  assert.throws(() => positiveInt('0', 20, 'threshold'), /positive integer/);
  console.log('GitHub-only observability cadence self-test passed.');
}

async function fetchScheduledRuns(repo, token) {
  const url = 'https://api.github.com/repos/' + repo +
    '/actions/workflows/production-observability.yml/runs?event=schedule&per_page=100';
  const response = await fetch(url, {
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error('GitHub Actions run history unavailable (HTTP ' + response.status + ').');
  }
  const payload = await response.json();
  if (!Array.isArray(payload.workflow_runs)) {
    throw new Error('GitHub Actions run history returned no workflow_runs array.');
  }
  return payload.workflow_runs;
}

async function writeSummary(report) {
  const path = process.env.OBSERVABILITY_CADENCE_SUMMARY_PATH ??
    '.artifacts/observability/cadence-summary.md';
  await mkdir(dirname(path), { recursive: true });
  const lines = [
    '## GitHub Actions scheduled-monitoring coverage',
    '',
    '- Result: ' + (report.ok ? 'ON-TIME (observed)' : 'COVERAGE GAP / UNKNOWN'),
    '- Reason: ' + report.reason,
    '- Last observed scheduled-run interval: ' +
      (report.gapMinutes === undefined ? 'unavailable' : report.gapMinutes.toFixed(1) + ' minutes'),
    '- Maximum accepted observed interval: ' + report.maxGapMinutes + ' minutes',
    '- Previous run: ' + (report.previousRunId ?? 'unknown'),
    '- Current run: ' + (report.currentRunId ?? 'unknown'),
    '',
    'This is a retrospective audit executed by GitHub Actions itself. It cannot alert while no workflow runs, ' +
      'and does not restore log windows skipped by the existing 20-minute checker.',
    '',
  ];
  await writeFile(path, lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
}

async function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  const currentRunId = process.env.GITHUB_RUN_ID;
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error('GITHUB_REPOSITORY must be owner/repo.');
  }
  if (!token) throw new Error('GH_TOKEN is required.');
  if (!currentRunId) throw new Error('GITHUB_RUN_ID is required.');
  const maxGapMinutes = positiveInt(
    process.env.OBSERVABILITY_CADENCE_THRESHOLD_MINUTES,
    DEFAULT_MAX_GAP_MINUTES,
    'OBSERVABILITY_CADENCE_THRESHOLD_MINUTES',
  );
  let report;
  try {
    const runs = await fetchScheduledRuns(repo, token);
    report = evaluateScheduledCadence(runs, currentRunId, maxGapMinutes);
  } catch (error) {
    report = {
      ok: false,
      reason: error instanceof Error ? error.message : 'SCHEDULE_AUDIT_FAILED',
      currentRunId,
      maxGapMinutes,
    };
  }
  await writeSummary(report);
  if (!report.ok) process.exitCode = 1;
}

await main();
