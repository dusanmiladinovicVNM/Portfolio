#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PROJECT_REF="${SUPABASE_PROJECT_REF:-${1:-}}"
SUPABASE_CLI_VERSION=2.117.0

if [[ -z "$PROJECT_REF" ]]; then
  echo "SUPABASE_PROJECT_REF or first positional project-ref argument is required." >&2
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is required for linked migration deployment." >&2
  exit 1
fi

ACTUAL_SHA="$(git rev-parse HEAD)"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Supabase migration deployment requires a clean working tree." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi

if [[ "${DEPLOY_REQUIRE_REMOTE_MAIN:-0}" == "1" ]]; then
  DEPLOY_EXPECTED_SHA="$ACTUAL_SHA" \
    bash "$ROOT_DIR/scripts/deployment/assert-current-main.sh"
fi

run_supabase() {
  if [[ -n "${SUPABASE_CLI_BIN:-}" ]]; then
    "$SUPABASE_CLI_BIN" "$@"
  else
    pnpm dlx "supabase@${SUPABASE_CLI_VERSION}" "$@"
  fi
}

run_supabase link --project-ref "$PROJECT_REF"
run_supabase db push --linked --yes

MIGRATION_LIST="$(run_supabase migration list --linked)"
printf '%s\n' "$MIGRATION_LIST"

drift=0
while IFS= read -r line; do
  normalized="${line//|/│}"
  if [[ "$normalized" != *"│"* ]]; then
    continue
  fi

  IFS='│' read -r local_version remote_version _ <<< "$normalized"
  local_version="$(printf '%s' "$local_version" | xargs)"
  remote_version="$(printf '%s' "$remote_version" | xargs)"

  if [[ ! "$local_version" =~ ^[0-9]{14}$ && ! "$remote_version" =~ ^[0-9]{14}$ ]]; then
    continue
  fi

  if [[ "$local_version" != "$remote_version" ]]; then
    echo "Supabase migration history drift remains after db push: local='${local_version:-missing}' remote='${remote_version:-missing}'." >&2
    drift=1
  fi
done <<< "$MIGRATION_LIST"

if [[ "$drift" != "0" ]]; then
  exit 1
fi

echo "Supabase migrations applied and verified for $ACTUAL_SHA."
