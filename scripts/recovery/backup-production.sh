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

for command in pg_dump pg_restore psql openssl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "$command is required." >&2
    exit 1
  }
done

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

count_sql="
select format('%I.%I', schemaname, tablename), n_live_tup::bigint
from pg_stat_user_tables
where schemaname = 'public'
order by 1;
"

psql "$PORTFOLIO_PRODUCTION_DB_URL" -At -F $'\t' -c "$count_sql" > "$SOURCE_COUNTS"

pg_dump "$PORTFOLIO_PRODUCTION_DB_URL"   --format=custom   --no-owner   --no-acl   --schema=public   --file="$PUBLIC_DUMP"

pg_dump "$PORTFOLIO_PRODUCTION_DB_URL"   --data-only   --no-owner   --no-acl   --schema=auth   --table=auth.users   --table=auth.identities   --file="$AUTH_DUMP"

dump_sha="$(shasum -a 256 "$PUBLIC_DUMP" | awk '{print $1}')"
auth_sha="$(shasum -a 256 "$AUTH_DUMP" | awk '{print $1}')"
counts_sha="$(shasum -a 256 "$SOURCE_COUNTS" | awk '{print $1}')"

{
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "code_sha=$CODE_SHA"
  echo "postgres_server_version=$(psql "$PORTFOLIO_PRODUCTION_DB_URL" -Atqc 'show server_version')"
  echo "public_dump_sha256=$dump_sha"
  echo "auth_dump_sha256=$auth_sha"
  echo "source_row_counts_sha256=$counts_sha"
} > "$MANIFEST"

ADMIN_URL="$RESTORE_SERVER_URL/postgres"
RESTORE_URL="$RESTORE_SERVER_URL/$RESTORE_DB"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1   -c "drop database if exists \"$RESTORE_DB\" with (force)" >/dev/null
psql "$ADMIN_URL" -v ON_ERROR_STOP=1   -c "create database \"$RESTORE_DB\"" >/dev/null

cleanup() {
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1     -c "drop database if exists \"$RESTORE_DB\" with (force)" >/dev/null || true
}
trap cleanup EXIT

pg_restore   --no-owner   --no-acl   --exit-on-error   --dbname="$RESTORE_URL"   "$PUBLIC_DUMP"

psql "$RESTORE_URL" -At -F $'\t' -c "$count_sql" > "$RESTORE_COUNTS"

if ! diff -u "$SOURCE_COUNTS" "$RESTORE_COUNTS"; then
  echo "Production backup row-count parity check failed." >&2
  exit 1
fi

RECOVERY_DATABASE_URL="$RESTORE_URL"   pnpm --workspace-root exec vitest run   packages/infrastructure/test/recovery/production-restore-smoke.test.ts

encrypt_file() {
  local source="$1"
  local target="$2"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000     -pass env:PORTFOLIO_BACKUP_ENCRYPTION_KEY     -in "$source"     -out "$target"
  rm -f "$source"
}

encrypt_file "$PUBLIC_DUMP" "$PUBLIC_DUMP.enc"
encrypt_file "$AUTH_DUMP" "$AUTH_DUMP.enc"
encrypt_file "$SOURCE_COUNTS" "$SOURCE_COUNTS.enc"
rm -f "$RESTORE_COUNTS"

echo "Production backup created, restored, verified and encrypted."
