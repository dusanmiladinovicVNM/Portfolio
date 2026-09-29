#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

VERCEL_CLI_VERSION=59.19.1

for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required for production web deployment." >&2
    exit 1
  fi
done

ACTUAL_SHA="$(git rev-parse HEAD)"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Vercel production deployment requires a clean source checkout." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi

npm install --global "vercel@${VERCEL_CLI_VERSION}"

vercel pull \
  --yes \
  --environment=production \
  --token "$VERCEL_TOKEN"

vercel build \
  --prod \
  --token "$VERCEL_TOKEN"

if [[ "${DEPLOY_REQUIRE_REMOTE_MAIN:-0}" == "1" ]]; then
  DEPLOY_EXPECTED_SHA="$ACTUAL_SHA" \
    bash "$ROOT_DIR/scripts/deployment/assert-current-main.sh"
fi

DEPLOYMENT_URL="$(
  vercel deploy \
    --prebuilt \
    --prod \
    --yes \
    --token "$VERCEL_TOKEN"
)"

if [[ -z "$DEPLOYMENT_URL" ]]; then
  echo "Vercel production deployment did not return a deployment URL." >&2
  exit 1
fi

echo "Vercel production web deployed from $ACTUAL_SHA: $DEPLOYMENT_URL"
