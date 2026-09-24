#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUT_FILE="${1:-}"
if [[ -z "$OUT_FILE" ]]; then
  echo "Usage: bash scripts/recovery/build-binary-restore-operator.sh /path/to/output.mjs" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

pnpm dlx esbuild@0.28.2   scripts/recovery/restore-production-binaries.ts   --bundle   --format=esm   --platform=node   --target=es2022   --packages=bundle   --main-fields=module,main   --alias:@portfolio/application=./packages/application/src/index.ts   --alias:@portfolio/domain=./packages/domain/src/index.ts   --alias:@portfolio/infrastructure=./packages/infrastructure/src/index.ts   --alias:@portfolio/google-drive=./integrations/google-drive/src/index.ts   --outfile="$OUT_FILE"

node --check "$OUT_FILE"
