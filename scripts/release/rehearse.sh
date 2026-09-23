#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ACTUAL_SHA="$(git rev-parse HEAD)"
EXPECTED_SHA="${RELEASE_CODE_SHA:-$ACTUAL_SHA}"

if [[ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]]; then
  echo "Expected release SHA $EXPECTED_SHA, but checkout is $ACTUAL_SHA." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Release rehearsal requires a clean working tree." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi

RELEASE_CODE_SHA="$ACTUAL_SHA"
ARTIFACT_DIR="${RELEASE_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/release}"

mkdir -p "$ARTIFACT_DIR"

MANIFEST="$ARTIFACT_DIR/manifest.txt"
rm -f "$MANIFEST"

{
  echo "release_code_sha=$RELEASE_CODE_SHA"
  echo "started_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "browser_lifecycle=pending"
  echo "postgres_invariants=pending"
  echo "recovery_continuation=pending"
} > "$MANIFEST"

echo "Release gate 1/3: browser full-lifecycle workflow"
pnpm --filter @portfolio/web test:browser
sed -i.bak 's/browser_lifecycle=pending/browser_lifecycle=passed/' "$MANIFEST"
rm -f "$MANIFEST.bak"

echo "Release gate 2/3: PostgreSQL integration invariants"
pnpm test:integration
sed -i.bak 's/postgres_invariants=pending/postgres_invariants=passed/' "$MANIFEST"
rm -f "$MANIFEST.bak"

echo "Release gate 3/3: destructive backup/restore + post-restore continuation"
RECOVERY_CODE_SHA="$RELEASE_CODE_SHA" pnpm recovery:rehearse

RECOVERY_MANIFEST="${RECOVERY_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/recovery}/manifest.txt"
if [[ ! -f "$RECOVERY_MANIFEST" ]]; then
  echo "Recovery manifest missing after release rehearsal." >&2
  exit 1
fi

RECOVERY_SHA="$(awk -F= '$1 == "code_sha" { print $2 }' "$RECOVERY_MANIFEST")"
if [[ "$RECOVERY_SHA" != "$RELEASE_CODE_SHA" ]]; then
  echo "Recovery proof SHA $RECOVERY_SHA does not match release SHA $RELEASE_CODE_SHA." >&2
  exit 1
fi

sed -i.bak 's/recovery_continuation=pending/recovery_continuation=passed/' "$MANIFEST"
rm -f "$MANIFEST.bak"

{
  echo "completed_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "status=passed"
} >> "$MANIFEST"

echo "Full lifecycle MVP release gate passed for $RELEASE_CODE_SHA."
