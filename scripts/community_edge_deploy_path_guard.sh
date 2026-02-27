#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEPLOYMENT_CONTRACT_SCRIPT="scripts/community_edge_deployment_contract_check.sh"
GUARD_SCRIPT="scripts/community_edge_deploy_path_guard.sh"

echo "== Community edge deploy path guard =="

echo "[1/2] CI/scripts must not use direct supabase functions deploy/delete commands..."
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
  if [[ "$file" == "$GUARD_SCRIPT" ]]; then
    continue
  fi
  UNAPPROVED_MATCHES+=("$match")
done

if [[ "${#UNAPPROVED_MATCHES[@]}" -gt 0 ]]; then
  echo "FAIL: found direct edge deploy/delete commands in CI/scripts:"
  printf '  %s\n' "${UNAPPROVED_MATCHES[@]}"
  echo "Use the manifest contract path instead: bash $DEPLOYMENT_CONTRACT_SCRIPT"
  exit 1
fi
echo "PASS: no direct edge deploy/delete commands found."

echo "[2/2] Deployment contract script must exist and be manifest-driven..."
if [[ ! -f "$DEPLOYMENT_CONTRACT_SCRIPT" ]]; then
  echo "FAIL: missing deployment contract script at $DEPLOYMENT_CONTRACT_SCRIPT"
  exit 1
fi
if [[ ! -x "$DEPLOYMENT_CONTRACT_SCRIPT" ]]; then
  echo "FAIL: deployment contract script is not executable: $DEPLOYMENT_CONTRACT_SCRIPT"
  exit 1
fi
if ! rg -n 'deployment-manifest\.json' "$DEPLOYMENT_CONTRACT_SCRIPT" >/dev/null; then
  echo "FAIL: deployment contract script does not reference deployment-manifest.json"
  exit 1
fi
echo "PASS: deployment contract script is manifest-driven."

echo "PASS: community edge deploy path guard passed."
