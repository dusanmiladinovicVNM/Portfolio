#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPOSITORY_DIR="${DEPLOY_REPOSITORY_DIR:-$ROOT_DIR}"
REMOTE_NAME="${DEPLOY_REMOTE_NAME:-origin}"
REMOTE_BRANCH="${DEPLOY_REMOTE_BRANCH:-main}"

ACTUAL_SHA="$(git -C "$REPOSITORY_DIR" rev-parse HEAD)"
EXPECTED_SHA="${DEPLOY_EXPECTED_SHA:-$ACTUAL_SHA}"

if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Deployment checkout $ACTUAL_SHA does not match expected SHA $EXPECTED_SHA." >&2
  exit 1
fi

git -C "$REPOSITORY_DIR" fetch --no-tags "$REMOTE_NAME" "$REMOTE_BRANCH"
REMOTE_MAIN_SHA="$(git -C "$REPOSITORY_DIR" rev-parse FETCH_HEAD)"

if [[ "$REMOTE_MAIN_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Refusing stale production deployment: $REMOTE_NAME/$REMOTE_BRANCH is $REMOTE_MAIN_SHA, expected $EXPECTED_SHA." >&2
  exit 1
fi

echo "Current-main deployment fence passed for $EXPECTED_SHA."
