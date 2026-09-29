#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FENCE="$ROOT_DIR/scripts/deployment/assert-current-main.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ORIGIN="$TMP_DIR/origin.git"
WORK="$TMP_DIR/work"
PUBLISHER="$TMP_DIR/publisher"

git init --bare "$ORIGIN" >/dev/null
git init -b main "$WORK" >/dev/null
git -C "$WORK" config user.name "Portfolio CI"
git -C "$WORK" config user.email "ci@example.invalid"
printf 'release-a\n' > "$WORK/release.txt"
git -C "$WORK" add release.txt
git -C "$WORK" commit -m "release a" >/dev/null
git -C "$WORK" remote add origin "$ORIGIN"
git -C "$WORK" push -u origin main >/dev/null 2>&1

SHA_A="$(git -C "$WORK" rev-parse HEAD)"
DEPLOY_REPOSITORY_DIR="$WORK" DEPLOY_EXPECTED_SHA="$SHA_A" bash "$FENCE" >/dev/null

git clone --branch main "$ORIGIN" "$PUBLISHER" >/dev/null 2>&1
git -C "$PUBLISHER" config user.name "Portfolio CI"
git -C "$PUBLISHER" config user.email "ci@example.invalid"
printf 'release-b\n' >> "$PUBLISHER/release.txt"
git -C "$PUBLISHER" add release.txt
git -C "$PUBLISHER" commit -m "release b" >/dev/null
git -C "$PUBLISHER" push origin main >/dev/null 2>&1
SHA_B="$(git -C "$PUBLISHER" rev-parse HEAD)"

if DEPLOY_REPOSITORY_DIR="$WORK" DEPLOY_EXPECTED_SHA="$SHA_A" bash "$FENCE" >/dev/null 2>&1; then
  echo "Current-main fence accepted stale release $SHA_A after main advanced to $SHA_B." >&2
  exit 1
fi

git -C "$WORK" fetch --no-tags origin main >/dev/null 2>&1
git -C "$WORK" reset --hard FETCH_HEAD >/dev/null
DEPLOY_REPOSITORY_DIR="$WORK" DEPLOY_EXPECTED_SHA="$SHA_B" bash "$FENCE" >/dev/null

echo "Current-main deployment fence self-test passed."
