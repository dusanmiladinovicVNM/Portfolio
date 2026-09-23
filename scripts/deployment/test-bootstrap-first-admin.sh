#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SERVER_URL="${BOOTSTRAP_TEST_SERVER_URL:-postgresql://postgres:postgres@localhost:5432}"
DB_NAME="${BOOTSTRAP_TEST_DB:-portfolio_bootstrap_test}"
ADMIN_URL="$SERVER_URL/postgres"
DB_URL="$SERVER_URL/$DB_NAME"

cleanup() {
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1     -c "drop database if exists \"$DB_NAME\" with (force)" >/dev/null || true
}
trap cleanup EXIT

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$roles$;
SQL

cleanup
psql "$ADMIN_URL" -v ON_ERROR_STOP=1   -c "create database \"$DB_NAME\"" >/dev/null

for migration in supabase/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SQL

run_bootstrap() {
  local subject="$1"
  local name="$2"
  local email="$3"
  local output="$4"

  psql "$DB_URL"     --set=ON_ERROR_STOP=1     --set=admin_subject="$subject"     --set=admin_display_name="$name"     --set=admin_email="$email"     --file="$ROOT_DIR/scripts/deployment/bootstrap-first-admin.sql"     >"$output" 2>&1
}

set +e
run_bootstrap   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'   'Admin A'   'admin-a@example.com'   /tmp/portfolio-bootstrap-a.log &
PID_A=$!

run_bootstrap   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'   'Admin B'   'admin-b@example.com'   /tmp/portfolio-bootstrap-b.log &
PID_B=$!

wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?
set -e

if [[ "$STATUS_A" -eq 0 && "$STATUS_B" -eq 0 ]]; then
  echo "Both concurrent first-admin bootstrap attempts committed." >&2
  cat /tmp/portfolio-bootstrap-a.log >&2
  cat /tmp/portfolio-bootstrap-b.log >&2
  exit 1
fi

if [[ "$STATUS_A" -ne 0 && "$STATUS_B" -ne 0 ]]; then
  echo "Both concurrent first-admin bootstrap attempts failed." >&2
  cat /tmp/portfolio-bootstrap-a.log >&2
  cat /tmp/portfolio-bootstrap-b.log >&2
  exit 1
fi

APP_USERS="$(psql "$DB_URL" -Atqc 'select count(*) from public.app_users')"
IDENTITIES="$(psql "$DB_URL" -Atqc 'select count(*) from public.auth_identities')"

if [[ "$APP_USERS" != "1" || "$IDENTITIES" != "1" ]]; then
  echo "Expected exactly one app_user and one auth_identity; got $APP_USERS / $IDENTITIES." >&2
  exit 1
fi

LOSER_LOG=/tmp/portfolio-bootstrap-a.log
if [[ "$STATUS_B" -ne 0 ]]; then
  LOSER_LOG=/tmp/portfolio-bootstrap-b.log
fi

if ! grep -q 'First-admin bootstrap requires empty app_users and auth_identities tables.' "$LOSER_LOG"; then
  echo "Concurrent bootstrap loser did not fail with the initialized-state guard." >&2
  cat "$LOSER_LOG" >&2
  exit 1
fi

echo "Concurrent first-admin bootstrap PASS: exactly one winner."
