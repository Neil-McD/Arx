#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Foundation baseline gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

TOTAL_STEPS=31
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

run_step "Gate parity contract" bash scripts/gate_parity_contract_check.sh
run_step "Legacy onboarding retirement contract" npm run check:legacy-onboarding-retirement-contract
run_step "Community-first release compatibility contract" npm run check:community-first-release-compatibility-contract
run_step "Community launcher retirement contract" npm run check:community-launcher-retirement-proof
run_step "Legacy route surface guard" bash scripts/legacy_route_surface_guard.sh
run_step "No compat RPC primitive guard" bash scripts/no_compat_rpc_primitive_guard.sh
run_step "Auth env contract guard" bash scripts/auth_env_contract_guard.sh
run_step "No direct legacy-auth imports guard" bash scripts/no_direct_legacy_auth_imports_guard.sh
run_step "Legacy function transport surface guard" bash scripts/legacy_function_transport_surface_guard.sh
run_step "Convex client surface guard" bash scripts/convex_client_surface_guard.sh
run_step "Convex verified identity guard" bash scripts/convex_verified_identity_guard.sh
run_step "Auth bootstrap public identity guard" bash scripts/auth_bootstrap_public_identity_guard.sh
run_step "Auth and billing public identity guard" bash scripts/auth_billing_public_identity_guard.sh
run_step "Account deletion quarantine contract" npm run check:account-delete-error-contract
run_step "No legacy Builder plan infra guard" npm run check:no-builder-plan-infra
run_step "Purchase token hygiene proof" npm run check:purchase-token-hygiene-proof
run_step "Frontend privacy hygiene proof" npm run check:frontend-privacy-hygiene-proof
run_step "Community admin contract guard" bash scripts/community_admin_contract_guard.sh
run_step "Community public identity guard" bash scripts/community_public_identity_guard.sh
run_step "Community deletion quarantine behavior" npm run check:community-cognition-cleanup-behavior
run_step "Community access role policy proof" npm run check:community-access-role-policy-proof
run_step "Community subscription lifecycle policy proof" npm run check:community-subscription-lifecycle-policy-proof
run_step "Runtime turn contract guard" bash scripts/runtime_turn_contract_guard.sh
run_step "Canonical operation surface proof" npm run check:canonical-operation-surface-proof
run_step "Community semantic repository proof" npm run check:community-semantic-repository-proof
run_step "No third-party MCP surface proof" npm run check:no-third-party-mcp-surface-proof
run_step "Official Polynet MCP contract proof" npm run check:polynet-workspace-mcp-proof
run_step "Official Polynet MCP authorization proof" npm run check:polynet-workspace-mcp-auth-proof
run_step "Repository behavior tests" npm test
run_step "No legacy provider repo guard" bash scripts/no_legacy_provider_repo_guard.sh
run_step "No legacy runtime-lane wording guard" bash scripts/no_platform_fallback_guard.sh

echo "PASS: foundation baseline gate passed."
