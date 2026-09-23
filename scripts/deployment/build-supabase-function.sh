#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="$ROOT_DIR/supabase/functions/api/dist"
OUT_FILE="$OUT_DIR/index.js"
MAX_BYTES=5000000
ESBUILD_VERSION=0.28.2

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

pnpm dlx "esbuild@${ESBUILD_VERSION}"   supabase/functions/api/index.ts   --bundle   --format=esm   --platform=neutral   --target=es2022   --packages=bundle   --main-fields=module,main   --outfile="$OUT_FILE"

BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"

if [[ "$BYTES" -ge "$MAX_BYTES" ]]; then
  echo "Supabase API bundle is ${BYTES} bytes; server-side deployment limit is below 5 MB." >&2
  exit 1
fi

if grep -Eq "from[[:space:]]+['\"]\.\.?/" "$OUT_FILE"; then
  echo "Supabase API bundle still contains relative ESM imports." >&2
  exit 1
fi

echo "Supabase API bundle ready: ${BYTES} bytes"
