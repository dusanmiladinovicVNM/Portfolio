#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

: "${PORTFOLIO_PRODUCTION_DB_URL:?PORTFOLIO_PRODUCTION_DB_URL is required}"
: "${PORTFOLIO_BACKUP_ENCRYPTION_KEY:?PORTFOLIO_BACKUP_ENCRYPTION_KEY is required}"

ARTIFACT_DIR="${PORTFOLIO_BACKUP_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/production-backup}"
RESTORE_SERVER_URL="${PORTFOLIO_BACKUP_RESTORE_SERVER_URL:-postgresql://postgres:postgres@localhost:5432}"
RESTORE_DB="${PORTFOLIO_BACKUP_RESTORE_DB:-portfolio_production_restore}"
CODE_SHA="${PORTFOLIO_BACKUP_CODE_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD)}}"
PG_IMAGE="${PORTFOLIO_BACKUP_PG_IMAGE:-postgres:17}"
USE_DOCKER="${PORTFOLIO_BACKUP_USE_DOCKER_TOOLS:-0}"
INCLUDE_AUTH="${PORTFOLIO_BACKUP_INCLUDE_AUTH:-1}"

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required." >&2
  exit 1
}

if [[ "$USE_DOCKER" == "1" ]]; then
  command -v docker >/dev/null 2>&1 || {
    echo "docker is required when PORTFOLIO_BACKUP_USE_DOCKER_TOOLS=1." >&2
    exit 1
  }
else
  for command in pg_dump pg_restore psql; do
    command -v "$command" >/dev/null 2>&1 || {
      echo "$command is required." >&2
      exit 1
    }
  done
fi

if [[ ! "$RESTORE_DB" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Invalid restore database name: $RESTORE_DB" >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/*

PUBLIC_DUMP="$ARTIFACT_DIR/portfolio-public.dump"
AUTH_DUMP="$ARTIFACT_DIR/supabase-auth-data.sql"
MANIFEST="$ARTIFACT_DIR/manifest.txt"
SOURCE_COUNTS="$ARTIFACT_DIR/source-row-counts.tsv"
RESTORE_COUNTS="$ARTIFACT_DIR/restore-row-counts.tsv"
MIGRATION_HASHES="$ARTIFACT_DIR/migrations.sha256"
EXPECTED_MIGRATIONS="$ARTIFACT_DIR/expected-migrations.tsv"
SOURCE_MIGRATIONS="$ARTIFACT_DIR/source-migrations.tsv"
RESTORE_SQL="$ARTIFACT_DIR/restore-data.sql"

psql_cmd() {
  local url="$1"
  shift
  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm -i --network host "$PG_IMAGE" psql "$url" "$@"
  else
    psql "$url" "$@"
  fi
}

apply_sql_file() {
  local url="$1"
  local file="$2"
  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm -i --network host "$PG_IMAGE" \
      psql "$url" -v ON_ERROR_STOP=1 < "$file"
  else
    psql "$url" -v ON_ERROR_STOP=1 -f "$file"
  fi
}

capture_counts() {
  local url="$1"
  local output="$2"
  : > "$output"

  while IFS= read -r table; do
    [[ -n "$table" ]] || continue
    local count
    count="$(psql_cmd "$url" -Atqc "select count(*) from public.$table")"
    printf 'public.%s\t%s\n' "$table" "$count" >> "$output"
  done < <(
    psql_cmd "$url" -Atqc \
      "select quote_ident(tablename)
       from pg_tables
       where schemaname = 'public'
         and tablename <> 'api_rate_limit_buckets'
       order by tablename"
  )
}

write_expected_migration_ledger() {
  : > "$EXPECTED_MIGRATIONS"
  while IFS= read -r migration; do
    local base version name
    base="$(basename "$migration")"
    version="${base%%_*}"
    name="${base#*_}"
    name="${name%.sql}"
    printf '%s\t%s\n' "$version" "$name" >> "$EXPECTED_MIGRATIONS"
  done < <(find supabase/migrations -type f -name '*.sql' | sort)
}

assert_source_migration_ledger() {
  psql_cmd "$PORTFOLIO_PRODUCTION_DB_URL" -At -F $'\t' -c \
    "select version, name
     from supabase_migrations.schema_migrations
     order by version" > "$SOURCE_MIGRATIONS"

  if ! diff -u "$EXPECTED_MIGRATIONS" "$SOURCE_MIGRATIONS"; then
    echo "Production migration ledger does not match repository migrations at code_sha=$CODE_SHA." >&2
    echo "Backup refused: deploy/apply migrations before taking a canonical data-only backup." >&2
    exit 1
  fi
}

dump_public() {
  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm --network host \
      -v "$ARTIFACT_DIR:/artifacts" \
      "$PG_IMAGE" \
      pg_dump "$PORTFOLIO_PRODUCTION_DB_URL" \
        --format=custom \
        --data-only \
        --no-owner \
        --no-acl \
        --schema=public \
        --exclude-table-data=public.api_rate_limit_buckets \
        --file=/artifacts/portfolio-public.dump
  else
    pg_dump "$PORTFOLIO_PRODUCTION_DB_URL" \
      --format=custom \
      --data-only \
      --no-owner \
      --no-acl \
      --schema=public \
      --exclude-table-data=public.api_rate_limit_buckets \
      --file="$PUBLIC_DUMP"
  fi
}
dump_auth() {
  if [[ "$INCLUDE_AUTH" != "1" ]]; then
    printf '%s\n' '-- Auth recovery asset omitted by explicit test configuration.' > "$AUTH_DUMP"
    return
  fi

  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm --network host \
      -v "$ARTIFACT_DIR:/artifacts" \
      "$PG_IMAGE" \
      pg_dump "$PORTFOLIO_PRODUCTION_DB_URL" \
        --data-only \
        --no-owner \
        --no-acl \
        --schema=auth \
        --table=auth.users \
        --table=auth.identities \
        --file=/artifacts/supabase-auth-data.sql
  else
    pg_dump "$PORTFOLIO_PRODUCTION_DB_URL" \
      --data-only \
      --no-owner \
      --no-acl \
      --schema=auth \
      --table=auth.users \
      --table=auth.identities \
      --file="$AUTH_DUMP"
  fi
}

restore_public() {
  local restore_url="$1"

  rm -f "$RESTORE_SQL"

  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm --network host \
      -v "$ARTIFACT_DIR:/artifacts" \
      "$PG_IMAGE" \
      pg_restore \
        --data-only \
        --no-owner \
        --no-acl \
        --file=/artifacts/restore-data.sql \
        /artifacts/portfolio-public.dump

    {
      printf '\\set ON_ERROR_STOP on\n'
      printf 'SET session_replication_role = replica;\n'
      cat "$RESTORE_SQL"
      printf '\nSET session_replication_role = origin;\n'
    } | docker run --rm -i --network host "$PG_IMAGE" \
      psql "$restore_url" -v ON_ERROR_STOP=1
  else
    pg_restore \
      --data-only \
      --no-owner \
      --no-acl \
      --file="$RESTORE_SQL" \
      "$PUBLIC_DUMP"

    {
      printf '\\set ON_ERROR_STOP on\n'
      printf 'SET session_replication_role = replica;\n'
      cat "$RESTORE_SQL"
      printf '\nSET session_replication_role = origin;\n'
    } | psql "$restore_url" -v ON_ERROR_STOP=1
  fi

  rm -f "$RESTORE_SQL"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

if command -v sha256sum >/dev/null 2>&1; then
  find supabase/migrations -type f -name '*.sql' -print0 \
    | sort -z \
    | xargs -0 sha256sum > "$MIGRATION_HASHES"
else
  find supabase/migrations -type f -name '*.sql' -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 > "$MIGRATION_HASHES"
fi

write_expected_migration_ledger
assert_source_migration_ledger
capture_counts "$PORTFOLIO_PRODUCTION_DB_URL" "$SOURCE_COUNTS"
dump_public
dump_auth

dump_sha="$(sha256_file "$PUBLIC_DUMP")"
auth_sha="$(sha256_file "$AUTH_DUMP")"
counts_sha="$(sha256_file "$SOURCE_COUNTS")"
migrations_sha="$(sha256_file "$MIGRATION_HASHES")"
migration_ledger_sha="$(sha256_file "$SOURCE_MIGRATIONS")"

{
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "code_sha=$CODE_SHA"
  echo "postgres_server_version=$(psql_cmd "$PORTFOLIO_PRODUCTION_DB_URL" -Atqc 'show server_version')"
  echo "public_dump_sha256=$dump_sha"
  echo "auth_dump_sha256=$auth_sha"
  echo "source_row_counts_sha256=$counts_sha"
  echo "migrations_sha256=$migrations_sha"
  echo "source_migration_ledger_sha256=$migration_ledger_sha"
} > "$MANIFEST"

ADMIN_URL="$RESTORE_SERVER_URL/postgres"
RESTORE_URL="$RESTORE_SERVER_URL/$RESTORE_DB"

psql_cmd "$ADMIN_URL" -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$RESTORE_DB\" with (force)" >/dev/null
psql_cmd "$ADMIN_URL" -v ON_ERROR_STOP=1 \
  -c "create database \"$RESTORE_DB\"" >/dev/null

psql_cmd "$ADMIN_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
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
  apply_sql_file "$RESTORE_URL" "$migration" >/dev/null
done

cleanup() {
  psql_cmd "$ADMIN_URL" -v ON_ERROR_STOP=1 \
    -c "drop database if exists \"$RESTORE_DB\" with (force)" >/dev/null || true
}
trap cleanup EXIT

restore_public "$RESTORE_URL"
capture_counts "$RESTORE_URL" "$RESTORE_COUNTS"

if ! diff -u "$SOURCE_COUNTS" "$RESTORE_COUNTS"; then
  echo "Production backup exact row-count parity check failed." >&2
  exit 1
fi

RECOVERY_DATABASE_URL="$RESTORE_URL" \
  pnpm --workspace-root exec vitest run \
  packages/infrastructure/test/recovery/production-restore-smoke.test.ts

encrypt_file() {
  local source="$1"
  local target="$2"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
    -pass env:PORTFOLIO_BACKUP_ENCRYPTION_KEY \
    -in "$source" \
    -out "$target"
  rm -f "$source"
}

encrypt_file "$PUBLIC_DUMP" "$PUBLIC_DUMP.enc"
encrypt_file "$AUTH_DUMP" "$AUTH_DUMP.enc"
encrypt_file "$SOURCE_COUNTS" "$SOURCE_COUNTS.enc"
encrypt_file "$MIGRATION_HASHES" "$MIGRATION_HASHES.enc"
encrypt_file "$SOURCE_MIGRATIONS" "$SOURCE_MIGRATIONS.enc"
rm -f "$EXPECTED_MIGRATIONS" "$RESTORE_COUNTS" "$RESTORE_SQL"

echo "Production backup created, restored, verified and encrypted."
