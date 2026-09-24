#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

: "${PORTFOLIO_PRODUCTION_DB_URL:?PORTFOLIO_PRODUCTION_DB_URL is required}"
: "${PORTFOLIO_BACKUP_ENCRYPTION_KEY:?PORTFOLIO_BACKUP_ENCRYPTION_KEY is required}"
: "${PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID:?PORTFOLIO_GOOGLE_DRIVE_FOLDER_ID is required}"
: "${PORTFOLIO_GOOGLE_CLIENT_ID:?PORTFOLIO_GOOGLE_CLIENT_ID is required}"
: "${PORTFOLIO_GOOGLE_CLIENT_SECRET:?PORTFOLIO_GOOGLE_CLIENT_SECRET is required}"
: "${PORTFOLIO_GOOGLE_REFRESH_TOKEN:?PORTFOLIO_GOOGLE_REFRESH_TOKEN is required}"

ARTIFACT_DIR="${PORTFOLIO_BINARY_BACKUP_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/production-binary-backup}"
PG_IMAGE="${PORTFOLIO_BINARY_BACKUP_PG_IMAGE:-postgres:17}"
USE_DOCKER="${PORTFOLIO_BINARY_BACKUP_USE_DOCKER_TOOLS:-1}"
CODE_SHA="${PORTFOLIO_BACKUP_CODE_SHA:-$(git rev-parse HEAD)}"

for command in node openssl tar; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "$command is required." >&2
    exit 1
  }
done

if [[ "$USE_DOCKER" == "1" ]]; then
  command -v docker >/dev/null 2>&1 || {
    echo "docker is required when PORTFOLIO_BINARY_BACKUP_USE_DOCKER_TOOLS=1." >&2
    exit 1
  }
else
  command -v psql >/dev/null 2>&1 || {
    echo "psql is required." >&2
    exit 1
  }
fi

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"

CANONICAL_JSON="$ARTIFACT_DIR/canonical-binaries.json"
SNAPSHOT_DIR="$ARTIFACT_DIR/snapshot"
VERIFY_DIR="$ARTIFACT_DIR/verify"
BUNDLE="$ARTIFACT_DIR/portfolio-binaries.tar"
OUTER_MANIFEST="$ARTIFACT_DIR/manifest.txt"

psql_query() {
  local query="$1"
  if [[ "$USE_DOCKER" == "1" ]]; then
    docker run --rm "$PG_IMAGE"       psql "$PORTFOLIO_PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 -Atqc "$query"
  else
    psql "$PORTFOLIO_PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 -Atqc "$query"
  fi
}

read -r -d '' INVENTORY_SQL <<'SQL' || true
select coalesce(
  json_agg(
    json_build_object(
      'versionId', x.version_id,
      'documentId', x.document_id,
      'fileName', x.file_name,
      'mimeType', x.mime_type,
      'byteSize', x.byte_size,
      'sha256', x.sha256,
      'provider', x.storage_provider,
      'objectId', x.storage_object_id,
      'objectKey', x.storage_object_key
    )
    order by x.version_id
  ),
  '[]'::json
)::text
from (
  select
    v.id::text as version_id,
    v.document_id::text as document_id,
    v.file_name,
    v.mime_type,
    v.byte_size::bigint as byte_size,
    v.sha256,
    coalesce(r.storage_provider, v.storage_provider) as storage_provider,
    coalesce(r.storage_object_id, v.storage_object_id) as storage_object_id,
    coalesce(r.storage_object_key, v.storage_object_key) as storage_object_key
  from public.document_versions v
  left join lateral (
    select
      storage_provider,
      storage_object_id,
      storage_object_key
    from public.document_version_storage_relocations
    where document_version_id = v.id
    order by generation desc
    limit 1
  ) r on true
  where coalesce(r.storage_provider, v.storage_provider) = 'google-drive'
) x;
SQL

psql_query "$INVENTORY_SQL" > "$CANONICAL_JSON"

PORTFOLIO_BINARY_CANONICAL_JSON="$CANONICAL_JSON" PORTFOLIO_BINARY_SNAPSHOT_DIR="$SNAPSHOT_DIR" PORTFOLIO_BACKUP_CODE_SHA="$CODE_SHA" node scripts/recovery/backup-google-drive-binaries.mjs

tar -C "$SNAPSHOT_DIR" -cf "$BUNDLE" manifest.json objects

rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"
tar -C "$VERIFY_DIR" -xf "$BUNDLE"
node scripts/recovery/backup-google-drive-binaries.mjs --verify "$VERIFY_DIR"

object_count="$(node -e "const m=require('fs').readFileSync(process.argv[1],'utf8'); console.log(JSON.parse(m).objectCount)" "$SNAPSHOT_DIR/manifest.json")"
total_bytes="$(node -e "const m=require('fs').readFileSync(process.argv[1],'utf8'); console.log(JSON.parse(m).totalBytes)" "$SNAPSHOT_DIR/manifest.json")"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

bundle_sha="$(sha256_file "$BUNDLE")"

{
  echo "format=portfolio-binary-backup-v1"
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "code_sha=$CODE_SHA"
  echo "object_count=$object_count"
  echo "total_bytes=$total_bytes"
  echo "plaintext_bundle_sha256=$bundle_sha"
} > "$OUTER_MANIFEST"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000   -pass env:PORTFOLIO_BACKUP_ENCRYPTION_KEY   -in "$BUNDLE"   -out "$BUNDLE.enc"

rm -rf "$SNAPSHOT_DIR" "$VERIFY_DIR"
rm -f "$CANONICAL_JSON" "$BUNDLE"

test -f "$BUNDLE.enc"
test -f "$OUTER_MANIFEST"
test ! -e "$SNAPSHOT_DIR"
test ! -e "$VERIFY_DIR"
test ! -e "$CANONICAL_JSON"
test ! -e "$BUNDLE"

echo "Production binary backup created, round-trip verified and encrypted."
