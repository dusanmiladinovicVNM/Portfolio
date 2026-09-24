#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SERVER_URL="${BACKUP_TEST_SERVER_URL:-postgresql://postgres:postgres@localhost:5432}"
SOURCE_DB="portfolio_backup_source"
ADMIN_URL="$SERVER_URL/postgres"
SOURCE_URL="$SERVER_URL/$SOURCE_DB"

cleanup() {
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1     -c "drop database if exists \"$SOURCE_DB\" with (force)" >/dev/null || true
}
trap cleanup EXIT

cleanup
psql "$ADMIN_URL" -v ON_ERROR_STOP=1   -c "create database \"$SOURCE_DB\"" >/dev/null

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$roles$;
SQL

for migration in supabase/migrations/*.sql; do
  psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

psql "$SOURCE_URL" -v ON_ERROR_STOP=1   -f scripts/recovery/fixture.sql >/dev/null

PORTFOLIO_PRODUCTION_DB_URL="$SOURCE_URL" PORTFOLIO_BACKUP_ENCRYPTION_KEY="ci-only-backup-key-not-for-production" PORTFOLIO_BACKUP_RESTORE_SERVER_URL="$SERVER_URL" PORTFOLIO_BACKUP_USE_DOCKER_TOOLS=1 PORTFOLIO_BACKUP_INCLUDE_AUTH=0 PORTFOLIO_BACKUP_CODE_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}" bash scripts/recovery/backup-production.sh

test -f .artifacts/production-backup/portfolio-public.dump.enc
test -f .artifacts/production-backup/supabase-auth-data.sql.enc
test -f .artifacts/production-backup/source-row-counts.tsv.enc
test -f .artifacts/production-backup/manifest.txt

test ! -f .artifacts/production-backup/portfolio-public.dump
test ! -f .artifacts/production-backup/supabase-auth-data.sql
test ! -f .artifacts/production-backup/source-row-counts.tsv

echo "Production backup CI rehearsal passed."
