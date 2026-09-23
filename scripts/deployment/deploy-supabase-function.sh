#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROJECT_REF="${SUPABASE_PROJECT_REF:-${1:-}}"
SUPABASE_CLI_VERSION=2.117.0
ARTIFACT_DIR="${DEPLOY_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/deployment}"
MANIFEST="$ARTIFACT_DIR/supabase-api-manifest.txt"
OUT_FILE="$ROOT_DIR/supabase/functions/api/dist/index.js"

if [[ -z "$PROJECT_REF" ]]; then
  echo "SUPABASE_PROJECT_REF or first positional project-ref argument is required." >&2
  exit 1
fi

ACTUAL_SHA="$(git rev-parse HEAD)"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Supabase deployment requires a clean working tree." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi

DEPLOY_CODE_SHA="$ACTUAL_SHA" pnpm supabase:function:bundle

if [[ ! -f "$MANIFEST" || ! -f "$OUT_FILE" ]]; then
  echo "Supabase deployment artifact or manifest is missing." >&2
  exit 1
fi

SOURCE_SHA="$(awk -F= '$1 == "source_sha" { print $2 }' "$MANIFEST")"
MANIFEST_BUNDLE_SHA="$(awk -F= '$1 == "bundle_sha256" { print $2 }' "$MANIFEST")"
CURRENT_BUNDLE_SHA="$(shasum -a 256 "$OUT_FILE" | awk '{print $1}')"

if [[ "$SOURCE_SHA" != "$ACTUAL_SHA" ]]; then
  echo "Deployment manifest source SHA $SOURCE_SHA does not match checkout $ACTUAL_SHA." >&2
  exit 1
fi

if [[ "$MANIFEST_BUNDLE_SHA" != "$CURRENT_BUNDLE_SHA" ]]; then
  echo "Generated Supabase bundle hash no longer matches the deployment manifest." >&2
  exit 1
fi

pnpm dlx "supabase@${SUPABASE_CLI_VERSION}" functions deploy api \
  --project-ref "$PROJECT_REF" \
  --use-api

HEALTH_URL="https://${PROJECT_REF}.supabase.co/functions/v1/api/health/live"
HEALTH_BODY="$(curl --fail --silent --show-error "$HEALTH_URL")"

if [[ "$HEALTH_BODY" != *"$SOURCE_SHA"* ]]; then
  echo "Hosted health response does not report deployed source SHA $SOURCE_SHA." >&2
  echo "$HEALTH_BODY" >&2
  exit 1
fi

echo "Supabase API deployed and verified for $SOURCE_SHA."
