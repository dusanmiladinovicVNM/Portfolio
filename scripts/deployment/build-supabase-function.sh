#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ACTUAL_SHA="$(git rev-parse HEAD)"
EXPECTED_SHA="${DEPLOY_CODE_SHA:-$ACTUAL_SHA}"

if [[ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]]; then
  echo "Expected deploy SHA $EXPECTED_SHA, but checkout is $ACTUAL_SHA." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Supabase deployment bundle requires a clean working tree." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi

OUT_DIR="$ROOT_DIR/supabase/functions/api/dist"
OUT_FILE="$OUT_DIR/index.js"
ARTIFACT_DIR="${DEPLOY_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/deployment}"
MANIFEST="$ARTIFACT_DIR/supabase-api-manifest.txt"
MAX_BYTES=5000000
ESBUILD_VERSION=0.28.2

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR" "$ARTIFACT_DIR"
rm -f "$MANIFEST"

BUILTIN_ALIAS_ARGS=()
while IFS= read -r builtin; do
  if [[ -n "$builtin" ]]; then
    BUILTIN_ALIAS_ARGS+=("--alias:${builtin}=node:${builtin}")
  fi
done < <(
  node --input-type=module -e '
    import { builtinModules } from "node:module";
    const modules = [...new Set(
      builtinModules
        .filter((name) => !name.startsWith("node:"))
        .sort(),
    )];
    process.stdout.write(modules.join("\n"));
  '
)

pnpm dlx "esbuild@${ESBUILD_VERSION}" \
  supabase/functions/api/index.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=es2022 \
  --packages=bundle \
  --main-fields=module,main \
  --alias:@portfolio/api=./apps/api/src/index.ts \
  --alias:@portfolio/application=./packages/application/src/index.ts \
  --alias:@portfolio/contracts=./packages/contracts/src/index.ts \
  --alias:@portfolio/domain=./packages/domain/src/index.ts \
  --alias:@portfolio/http=./packages/http/src/index.ts \
  --alias:@portfolio/infrastructure=./packages/infrastructure/src/index.ts \
  --alias:@portfolio/google-drive=./integrations/google-drive/src/index.ts \
  "${BUILTIN_ALIAS_ARGS[@]}" \
  --inject:./scripts/deployment/esbuild-node-globals.ts \
  --define:__PORTFOLIO_BUILD_SHA__="\"$ACTUAL_SHA\"" \
  --outfile="$OUT_FILE"


BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"

if [[ "$BYTES" -ge "$MAX_BYTES" ]]; then
  echo "Supabase API bundle is ${BYTES} bytes; server-side deployment limit is below 5 MB." >&2
  exit 1
fi

if grep -Eq "from[[:space:]]+['\"]\.\.?/" "$OUT_FILE"; then
  echo "Supabase API bundle still contains relative ESM imports." >&2
  exit 1
fi

if ! grep -Fq "$ACTUAL_SHA" "$OUT_FILE"; then
  echo "Supabase API bundle does not contain verified source SHA $ACTUAL_SHA." >&2
  exit 1
fi

if grep -Fq "__PORTFOLIO_BUILD_SHA__" "$OUT_FILE"; then
  echo "Supabase API bundle still contains unresolved build-SHA placeholder." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Supabase bundle build changed the tracked/untracked source tree." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi

BUNDLE_SHA256="$(shasum -a 256 "$OUT_FILE" | awk '{print $1}')"

{
  echo "source_sha=$ACTUAL_SHA"
  echo "bundle_sha256=$BUNDLE_SHA256"
  echo "bundle_bytes=$BYTES"
  echo "esbuild_version=$ESBUILD_VERSION"
} > "$MANIFEST"

echo "Supabase API bundle ready: ${BYTES} bytes"
echo "Deployment manifest: $MANIFEST"
