#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

RECOVERY_SERVER_URL="${RECOVERY_SERVER_URL:-postgresql://postgres:postgres@localhost:5432}"
RECOVERY_SOURCE_DB="${RECOVERY_SOURCE_DB:-portfolio_recovery_source}"
RECOVERY_RESTORE_DB="${RECOVERY_RESTORE_DB:-portfolio_recovery_restore}"
RECOVERY_PG_IMAGE="${RECOVERY_PG_IMAGE:-postgres:17}"
RECOVERY_USE_DOCKER_TOOLS="${RECOVERY_USE_DOCKER_TOOLS:-0}"
RECOVERY_KEEP_DATABASES="${RECOVERY_KEEP_DATABASES:-0}"
ARTIFACT_DIR="${RECOVERY_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/recovery}"

for database in "$RECOVERY_SOURCE_DB" "$RECOVERY_RESTORE_DB"; do
  if [[ ! "$database" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "Invalid recovery database name: $database" >&2
    exit 1
  fi
done

command -v psql >/dev/null 2>&1 || {
  echo "psql is required for the recovery rehearsal." >&2
  exit 1
}

if [[ "$RECOVERY_USE_DOCKER_TOOLS" == "1" ]]; then
  command -v docker >/dev/null 2>&1 || {
    echo "docker is required when RECOVERY_USE_DOCKER_TOOLS=1." >&2
    exit 1
  }
else
  command -v pg_dump >/dev/null 2>&1 || {
    echo "pg_dump is required for the recovery rehearsal." >&2
    exit 1
  }
  command -v pg_restore >/dev/null 2>&1 || {
    echo "pg_restore is required for the recovery rehearsal." >&2
    exit 1
  }
fi

ADMIN_URL="$RECOVERY_SERVER_URL/postgres"
SOURCE_URL="$RECOVERY_SERVER_URL/$RECOVERY_SOURCE_DB"
RESTORE_URL="$RECOVERY_SERVER_URL/$RECOVERY_RESTORE_DB"

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR/portfolio.dump"   "$ARTIFACT_DIR/portfolio.dump.sha256"   "$ARTIFACT_DIR/migrations.sha256"   "$ARTIFACT_DIR/manifest.txt"

drop_database() {
  local database="$1"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1     -c "drop database if exists \"$database\" with (force)" >/dev/null
}

create_database() {
  local database="$1"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1     -c "create database \"$database\"" >/dev/null
}

cleanup() {
  if [[ "$RECOVERY_KEEP_DATABASES" != "1" ]]; then
    drop_database "$RECOVERY_SOURCE_DB" || true
    drop_database "$RECOVERY_RESTORE_DB" || true
  fi
}
trap cleanup EXIT

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

drop_database "$RECOVERY_SOURCE_DB"
drop_database "$RECOVERY_RESTORE_DB"
create_database "$RECOVERY_SOURCE_DB"

for migration in supabase/migrations/*.sql; do
  psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

psql "$SOURCE_URL" -v ON_ERROR_STOP=1   -f scripts/recovery/fixture.sql >/dev/null

if command -v sha256sum >/dev/null 2>&1; then
  find supabase/migrations -type f -name '*.sql' -print0     | sort -z     | xargs -0 sha256sum > "$ARTIFACT_DIR/migrations.sha256"
else
  find supabase/migrations -type f -name '*.sql' -print0     | sort -z     | xargs -0 shasum -a 256 > "$ARTIFACT_DIR/migrations.sha256"
fi

if [[ "$RECOVERY_USE_DOCKER_TOOLS" == "1" ]]; then
  docker run --rm --network host     -v "$ARTIFACT_DIR:/artifacts"     "$RECOVERY_PG_IMAGE"     pg_dump "$SOURCE_URL"       --format=custom       --no-owner       --no-acl       --file=/artifacts/portfolio.dump
else
  pg_dump "$SOURCE_URL"     --format=custom     --no-owner     --no-acl     --file="$ARTIFACT_DIR/portfolio.dump"
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$ARTIFACT_DIR" && sha256sum portfolio.dump > portfolio.dump.sha256)
else
  (cd "$ARTIFACT_DIR" && shasum -a 256 portfolio.dump > portfolio.dump.sha256)
fi

{
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "git_sha=${GITHUB_SHA:-$(git rev-parse HEAD)}"
  echo "postgres_server_version=$(psql "$SOURCE_URL" -Atqc 'show server_version')"
  echo "source_database=$RECOVERY_SOURCE_DB"
  echo "restore_database=$RECOVERY_RESTORE_DB"
  echo "migration_count=$(find supabase/migrations -type f -name '*.sql' | wc -l | tr -d ' ')"
} > "$ARTIFACT_DIR/manifest.txt"

# Disaster boundary: the source is gone before the restore database exists.
drop_database "$RECOVERY_SOURCE_DB"
create_database "$RECOVERY_RESTORE_DB"

if [[ "$RECOVERY_USE_DOCKER_TOOLS" == "1" ]]; then
  docker run --rm --network host     -v "$ARTIFACT_DIR:/artifacts"     "$RECOVERY_PG_IMAGE"     pg_restore       --no-owner       --no-acl       --exit-on-error       --dbname="$RESTORE_URL"       /artifacts/portfolio.dump
else
  pg_restore     --no-owner     --no-acl     --exit-on-error     --dbname="$RESTORE_URL"     "$ARTIFACT_DIR/portfolio.dump"
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$ARTIFACT_DIR" && sha256sum -c portfolio.dump.sha256)
  sha256sum -c "$ARTIFACT_DIR/migrations.sha256"
else
  (cd "$ARTIFACT_DIR" && shasum -a 256 -c portfolio.dump.sha256)
  shasum -a 256 -c "$ARTIFACT_DIR/migrations.sha256"
fi

psql "$RESTORE_URL" -v ON_ERROR_STOP=1   -f scripts/recovery/verify-restored.sql >/dev/null

RECOVERY_DATABASE_URL="$RESTORE_URL"   pnpm --workspace-root exec vitest run   packages/infrastructure/test/recovery/restore-smoke.test.ts

echo "Recovery rehearsal passed: source deleted, fresh restore verified."
