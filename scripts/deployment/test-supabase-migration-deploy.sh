#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT_DIR/scripts/deployment/deploy-supabase-migrations.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE="$TMP_DIR/supabase"
FENCE="$TMP_DIR/current-main-fence"
LOG="$TMP_DIR/commands.log"

cat > "$FAKE" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "$FAKE_SUPABASE_LOG"

if [[ "$1" == "link" ]]; then
  echo "Linked project."
  exit 0
fi

if [[ "$1" == "db" && "$2" == "push" ]]; then
  if [[ "${FAKE_FAIL_PUSH:-0}" == "1" ]]; then
    echo "intentional db push failure" >&2
    exit 23
  fi
  echo "Finished supabase db push."
  exit 0
fi

if [[ "$1" == "migration" && "$2" == "list" ]]; then
  echo "        LOCAL      │     REMOTE     │     TIME (UTC)"
  echo "───────────────────┼────────────────┼──────────────────────"
  if [[ "${FAKE_MIGRATION_DRIFT:-0}" == "1" ]]; then
    echo "  20260926193000   │                │ 2026-09-26 19:30:00"
  else
    echo "  20260926193000   │ 20260926193000 │ 2026-09-26 19:30:00"
  fi
  exit 0
fi

echo "unexpected fake Supabase CLI command: $*" >&2
exit 64
FAKE
chmod +x "$FAKE"

cat > "$FENCE" <<'FENCE'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "current-main-fence" >> "$FAKE_SUPABASE_LOG"

if [[ "${FAKE_FAIL_FENCE:-0}" == "1" ]]; then
  echo "intentional current-main fence failure" >&2
  exit 24
fi
FENCE
chmod +x "$FENCE"

run_success() {
  : > "$LOG"
  (
    cd "$ROOT_DIR"
    SUPABASE_PROJECT_REF="test-project" \
    SUPABASE_ACCESS_TOKEN="test-token" \
    SUPABASE_DB_PASSWORD="test-password" \
    SUPABASE_CLI_BIN="$FAKE" \
    DEPLOY_REQUIRE_REMOTE_MAIN=1 \
    DEPLOY_CURRENT_MAIN_FENCE_BIN="$FENCE" \
    FAKE_SUPABASE_LOG="$LOG" \
    bash "$DEPLOY"
  ) >/dev/null

  mapfile -t commands < "$LOG"
  [[ "${commands[0]}" == "link --project-ref test-project" ]]
  [[ "${commands[1]}" == "current-main-fence" ]]
  [[ "${commands[2]}" == "db push --linked --yes" ]]
  [[ "${commands[3]}" == "migration list --linked" ]]
}

run_push_failure() {
  : > "$LOG"
  if (
    cd "$ROOT_DIR"
    SUPABASE_PROJECT_REF="test-project" \
    SUPABASE_ACCESS_TOKEN="test-token" \
    SUPABASE_DB_PASSWORD="test-password" \
    SUPABASE_CLI_BIN="$FAKE" \
    DEPLOY_REQUIRE_REMOTE_MAIN=1 \
    DEPLOY_CURRENT_MAIN_FENCE_BIN="$FENCE" \
    FAKE_SUPABASE_LOG="$LOG" \
    FAKE_FAIL_PUSH=1 \
    bash "$DEPLOY"
  ) >/dev/null 2>&1; then
    echo "Migration deploy accepted a failed db push." >&2
    exit 1
  fi

  if grep -q '^migration list' "$LOG"; then
    echo "Migration deploy continued after failed db push." >&2
    exit 1
  fi
}

run_fence_failure() {
  : > "$LOG"
  if (
    cd "$ROOT_DIR"
    SUPABASE_PROJECT_REF="test-project" \
    SUPABASE_ACCESS_TOKEN="test-token" \
    SUPABASE_DB_PASSWORD="test-password" \
    SUPABASE_CLI_BIN="$FAKE" \
    DEPLOY_REQUIRE_REMOTE_MAIN=1 \
    DEPLOY_CURRENT_MAIN_FENCE_BIN="$FENCE" \
    FAKE_SUPABASE_LOG="$LOG" \
    FAKE_FAIL_FENCE=1 \
    bash "$DEPLOY"
  ) >/dev/null 2>&1; then
    echo "Migration deploy accepted a failed current-main fence." >&2
    exit 1
  fi

  if grep -q '^db push' "$LOG"; then
    echo "Migration deploy mutated the database after a failed current-main fence." >&2
    exit 1
  fi

  if grep -q '^migration list' "$LOG"; then
    echo "Migration deploy continued after a failed current-main fence." >&2
    exit 1
  fi
}

run_drift_failure() {
  : > "$LOG"
  if (
    cd "$ROOT_DIR"
    SUPABASE_PROJECT_REF="test-project" \
    SUPABASE_ACCESS_TOKEN="test-token" \
    SUPABASE_DB_PASSWORD="test-password" \
    SUPABASE_CLI_BIN="$FAKE" \
    DEPLOY_REQUIRE_REMOTE_MAIN=1 \
    DEPLOY_CURRENT_MAIN_FENCE_BIN="$FENCE" \
    FAKE_SUPABASE_LOG="$LOG" \
    FAKE_MIGRATION_DRIFT=1 \
    bash "$DEPLOY"
  ) >/dev/null 2>&1; then
    echo "Migration deploy accepted remaining local/remote history drift." >&2
    exit 1
  fi
}

run_success
run_fence_failure
run_push_failure
run_drift_failure

echo "Supabase migration deployment self-test passed."
