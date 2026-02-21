#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WRAPPER_SCRIPT="scripts/community_edge_manifest_deploy.sh"
GUARD_SCRIPT="scripts/community_edge_deploy_path_guard.sh"

echo "== Community edge deploy path guard =="

echo "[1/3] Manifest-only deploy wrapper must exist..."
if [[ ! -f "$WRAPPER_SCRIPT" ]]; then
  echo "FAIL: missing manifest deploy wrapper at $WRAPPER_SCRIPT"
  exit 1
fi
if [[ ! -x "$WRAPPER_SCRIPT" ]]; then
  echo "FAIL: manifest deploy wrapper is not executable: $WRAPPER_SCRIPT"
  exit 1
fi

echo "[2/3] CI/scripts must not use direct supabase functions deploy/delete commands..."
DEPLOY_MATCHES=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  DEPLOY_MATCHES+=("$line")
done < <(
  rg -n 'supabase[[:space:]].*functions[[:space:]]+(deploy|delete|rm)' \
    .github/workflows scripts \
    -g '!**/node_modules/**' || true
)

UNAPPROVED_MATCHES=()
for match in "${DEPLOY_MATCHES[@]}"; do
  [[ -z "$match" ]] && continue
  file="${match%%:*}"
  if [[ "$file" == "$WRAPPER_SCRIPT" || "$file" == "$GUARD_SCRIPT" ]]; then
    continue
  fi
  UNAPPROVED_MATCHES+=("$match")
done

if [[ "${#UNAPPROVED_MATCHES[@]}" -gt 0 ]]; then
  echo "FAIL: found direct edge deploy/delete commands outside manifest wrapper:"
  printf '  %s\n' "${UNAPPROVED_MATCHES[@]}"
  echo "Use: bash $WRAPPER_SCRIPT"
  exit 1
fi
echo "PASS: no direct edge deploy/delete commands found outside wrapper."

echo "[3/3] Wrapper must deploy only from deployment manifest..."
if ! rg -n 'deployment-manifest\.json' "$WRAPPER_SCRIPT" >/dev/null; then
  echo "FAIL: wrapper does not reference deployment-manifest.json"
  exit 1
fi
if ! rg -n 'functions[[:space:]]+deploy' "$WRAPPER_SCRIPT" >/dev/null; then
  echo "FAIL: wrapper does not execute supabase functions deploy"
  exit 1
fi
echo "PASS: wrapper is manifest-driven."

echo "PASS: community edge deploy path guard passed."
