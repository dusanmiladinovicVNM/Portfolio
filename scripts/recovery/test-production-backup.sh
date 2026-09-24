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

psql "$SOURCE_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  name text not null
);
SQL

while IFS= read -r migration; do
  base="$(basename "$migration")"
  version="${base%%_*}"
  name="${base#*_}"
  name="${name%.sql}"
  psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -v version="$version" -v name="$name" <<'SQL' >/dev/null
insert into supabase_migrations.schema_migrations(version, name)
values (:'version', :'name');
SQL
done < <(find supabase/migrations -type f -name '*.sql' | sort)

LATEST_MIGRATION="$(find supabase/migrations -type f -name '*.sql' | sort | tail -n 1)"
LATEST_BASE="$(basename "$LATEST_MIGRATION")"
LATEST_VERSION="${LATEST_BASE%%_*}"
LATEST_NAME="${LATEST_BASE#*_}"
LATEST_NAME="${LATEST_NAME%.sql}"

psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -v version="$LATEST_VERSION" <<'SQL' >/dev/null
delete from supabase_migrations.schema_migrations
where version = :'version';
SQL

SABOTAGE_DIR="$ROOT_DIR/.artifacts/production-backup-migration-mismatch"
rm -rf "$SABOTAGE_DIR"

if PORTFOLIO_PRODUCTION_DB_URL="$SOURCE_URL"   PORTFOLIO_BACKUP_ENCRYPTION_KEY="ci-only-backup-key-not-for-production"   PORTFOLIO_BACKUP_RESTORE_SERVER_URL="$SERVER_URL"   PORTFOLIO_BACKUP_USE_DOCKER_TOOLS=1   PORTFOLIO_BACKUP_INCLUDE_AUTH=0   PORTFOLIO_BACKUP_ARTIFACT_DIR="$SABOTAGE_DIR"   PORTFOLIO_BACKUP_CODE_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"   bash scripts/recovery/backup-production.sh; then
  echo "Backup accepted a production/repository migration ledger mismatch." >&2
  exit 1
fi

test ! -e "$SABOTAGE_DIR/portfolio-public.dump"
test ! -e "$SABOTAGE_DIR/portfolio-public.dump.enc"

psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -v version="$LATEST_VERSION" -v name="$LATEST_NAME" <<'SQL' >/dev/null
insert into supabase_migrations.schema_migrations(version, name)
values (:'version', :'name');
SQL

psql "$SOURCE_URL" -v ON_ERROR_STOP=1   -f scripts/recovery/fixture.sql >/dev/null

psql "$SOURCE_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.app_users (
  id, display_name, email, role, status
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Backup Rehearsal Admin',
  'backup-admin@example.test',
  'admin',
  'active'
);

insert into public.auth_identities (
  user_id, provider, subject
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'supabase',
  'backup-rehearsal-subject'
);
SQL

PORTFOLIO_PRODUCTION_DB_URL="$SOURCE_URL" PORTFOLIO_BACKUP_ENCRYPTION_KEY="ci-only-backup-key-not-for-production" PORTFOLIO_BACKUP_RESTORE_SERVER_URL="$SERVER_URL" PORTFOLIO_BACKUP_USE_DOCKER_TOOLS=1 PORTFOLIO_BACKUP_INCLUDE_AUTH=0 PORTFOLIO_BACKUP_CODE_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}" bash scripts/recovery/backup-production.sh

test -f .artifacts/production-backup/portfolio-public.dump.enc
test -f .artifacts/production-backup/supabase-auth-data.sql.enc
test -f .artifacts/production-backup/source-row-counts.tsv.enc
test -f .artifacts/production-backup/migrations.sha256.enc
test -f .artifacts/production-backup/source-migrations.tsv.enc
test -f .artifacts/production-backup/manifest.txt

test ! -f .artifacts/production-backup/portfolio-public.dump
test ! -f .artifacts/production-backup/supabase-auth-data.sql
test ! -f .artifacts/production-backup/source-row-counts.tsv
test ! -f .artifacts/production-backup/migrations.sha256
test ! -f .artifacts/production-backup/source-migrations.tsv
test ! -f .artifacts/production-backup/expected-migrations.tsv
test ! -f .artifacts/production-backup/restore-data.sql

echo "Production migration mismatch sabotage PASS."
echo "Production backup CI rehearsal passed."
