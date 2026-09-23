#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${PORTFOLIO_ADMIN_SUBJECT:?PORTFOLIO_ADMIN_SUBJECT is required}"
: "${PORTFOLIO_ADMIN_DISPLAY_NAME:?PORTFOLIO_ADMIN_DISPLAY_NAME is required}"

PORTFOLIO_ADMIN_EMAIL="${PORTFOLIO_ADMIN_EMAIL:-}"

psql "$SUPABASE_DB_URL"   --set=ON_ERROR_STOP=1   --set=admin_subject="$PORTFOLIO_ADMIN_SUBJECT"   --set=admin_display_name="$PORTFOLIO_ADMIN_DISPLAY_NAME"   --set=admin_email="$PORTFOLIO_ADMIN_EMAIL"   --file="$ROOT_DIR/scripts/deployment/bootstrap-first-admin.sql"
