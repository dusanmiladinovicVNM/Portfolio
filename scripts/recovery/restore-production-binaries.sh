#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_PATH="${1:-}"
if [[ -z "$ARTIFACT_PATH" ]]; then
  echo "Usage: pnpm binary-backup:restore -- /path/to/portfolio-binaries.tar.enc" >&2
  exit 1
fi
if [[ ! -f "$ARTIFACT_PATH" ]]; then
  echo "Binary backup artifact does not exist: $ARTIFACT_PATH" >&2
  exit 1
fi

: "${PORTFOLIO_PRODUCTION_DB_URL:?PORTFOLIO_PRODUCTION_DB_URL is required}"
: "${PORTFOLIO_BACKUP_ENCRYPTION_KEY:?PORTFOLIO_BACKUP_ENCRYPTION_KEY is required}"
: "${PORTFOLIO_RECOVERY_GOOGLE_DRIVE_FOLDER_ID:?PORTFOLIO_RECOVERY_GOOGLE_DRIVE_FOLDER_ID is required}"
: "${PORTFOLIO_GOOGLE_CLIENT_ID:?PORTFOLIO_GOOGLE_CLIENT_ID is required}"
: "${PORTFOLIO_GOOGLE_CLIENT_SECRET:?PORTFOLIO_GOOGLE_CLIENT_SECRET is required}"
: "${PORTFOLIO_GOOGLE_REFRESH_TOKEN:?PORTFOLIO_GOOGLE_REFRESH_TOKEN is required}"

for command in node openssl tar; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "$command is required." >&2
    exit 1
  }
done

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/portfolio-binary-restore.XXXXXX")"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

BUNDLE="$WORK_DIR/portfolio-binaries.tar"
SNAPSHOT_DIR="$WORK_DIR/snapshot"
RESTORE_JS="$WORK_DIR/restore-production-binaries.mjs"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000   -pass env:PORTFOLIO_BACKUP_ENCRYPTION_KEY   -in "$ARTIFACT_PATH"   -out "$BUNDLE"

mkdir -p "$SNAPSHOT_DIR"
tar -C "$SNAPSHOT_DIR" -xf "$BUNDLE"

node scripts/recovery/backup-google-drive-binaries.mjs   --verify "$SNAPSHOT_DIR"

pnpm dlx esbuild@0.28.2   scripts/recovery/restore-production-binaries.ts   --bundle   --format=esm   --platform=node   --target=es2022   --packages=bundle   --main-fields=module,main   --alias:@portfolio/application=./packages/application/src/index.ts   --alias:@portfolio/domain=./packages/domain/src/index.ts   --alias:@portfolio/infrastructure=./packages/infrastructure/src/index.ts   --alias:@portfolio/google-drive=./integrations/google-drive/src/index.ts   --outfile="$RESTORE_JS"

PORTFOLIO_BINARY_SNAPSHOT_DIR="$SNAPSHOT_DIR"   node "$RESTORE_JS"

echo "Production binary restore completed and read-back verified."
