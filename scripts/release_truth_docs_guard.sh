#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Release truth docs guard =="

ACTIVE_DOCS=(
  "AGENTS.md"
  "docs/README.md"
  "docs/alpha-release-workflow.md"
  "convex/README.md"
)

for file in "${ACTIVE_DOCS[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "FAIL: missing active release-truth doc: $file"
    exit 1
  fi
done

echo "[1/5] Ensuring active docs do not point at the legacy Daytona worktree as release truth..."
for file in "${ACTIVE_DOCS[@]}"; do
  if rg -n '\.worktrees/daytona' "$file" >/dev/null; then
    if [[ "$file" != "AGENTS.md" && "$file" != "docs/alpha-release-workflow.md" ]]; then
      echo "FAIL: active doc references legacy Daytona worktree: $file"
      exit 1
    fi
  fi
done
echo "OK: no unexpected active-doc Daytona worktree references"

echo "[2/5] Ensuring direct local Vercel release commands stay forbidden..."
if ! rg -n 'direct local Vercel release commands are forbidden|Do not run `vercel deploy`, `vercel --prod`, `vercel promote`, `vercel alias`, or `vercel rollback`' AGENTS.md >/dev/null; then
  echo "FAIL: AGENTS.md no longer forbids direct local Vercel release commands"
  exit 1
fi
if ! rg -n 'Web production deploys must come from GitHub `origin/main` through Vercel project `polynet`' docs/alpha-release-workflow.md >/dev/null; then
  echo "FAIL: alpha release workflow no longer pins web production to origin/main -> polynet"
  exit 1
fi
echo "OK: local Vercel release bypass remains forbidden"

echo "[3/5] Ensuring historical release docs are explicitly marked historical..."
for file in \
  docs/archive/production-baseline-fingerprint-worksheet.md \
  docs/archive/daytona-alpha-deploy-manifest-2026-03-19.md \
  docs/archive/release-candidate-freeze-2026-04-02.md \
  docs/archive/alpha-builder-only-posture-2026-03-19.md
do
  if ! rg -n 'Historical evidence only\.' "$file" >/dev/null; then
    echo "FAIL: historical release doc lacks status banner: $file"
    exit 1
  fi
done
echo "OK: historical release docs are bannered"

echo "[4/5] Ensuring docs index exposes the current release truth..."
if ! rg -n '## Current Release Truth' docs/README.md >/dev/null; then
  echo "FAIL: docs index does not expose current release truth"
  exit 1
fi
if ! rg -n '`alpha-release-workflow\.md`' docs/README.md >/dev/null; then
  echo "FAIL: docs index does not point to alpha-release-workflow.md"
  exit 1
fi
echo "OK: docs index exposes release truth"

echo "[5/5] Ensuring docs index entries resolve to real docs..."
while IFS= read -r rel; do
  path="docs/$rel"
  if [[ ! -f "$path" ]]; then
    echo "FAIL: docs index references missing file: $rel"
    exit 1
  fi
done < <(
  rg -o '`[^`]+\.md`' docs/README.md |
    sed 's/^`//; s/`$//' |
    sort -u
)
echo "OK: docs index entries resolve"

echo "PASS: release truth docs guard passed."
