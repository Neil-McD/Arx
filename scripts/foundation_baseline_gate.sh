#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Foundation baseline gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

TOTAL_STEPS=66
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

run_step "Gate parity contract" bash scripts/gate_parity_contract_check.sh
run_step "No orphan Convex modules" npm run check:no-orphan-modules
run_step "System map covers every module and table" npm run check:system-map-coverage
run_step "One inference provider, founder-funded turns" npm run check:single-inference-provider
run_step "Community launcher retirement contract" npm run check:community-launcher-retirement-proof
run_step "Legacy route surface guard" bash scripts/legacy_route_surface_guard.sh
run_step "No compat RPC primitive guard" bash scripts/no_compat_rpc_primitive_guard.sh
run_step "Auth env contract guard" bash scripts/auth_env_contract_guard.sh
run_step "No direct legacy-auth imports guard" bash scripts/no_direct_legacy_auth_imports_guard.sh
run_step "Legacy function transport surface guard" bash scripts/legacy_function_transport_surface_guard.sh
run_step "Convex client surface guard" bash scripts/convex_client_surface_guard.sh
run_step "Convex client operation integrity proof" npm run check:convex-client-operation-integrity-proof
run_step "Convex verified identity guard" bash scripts/convex_verified_identity_guard.sh
run_step "Auth bootstrap public identity guard" bash scripts/auth_bootstrap_public_identity_guard.sh
run_step "Auth and billing public identity guard" bash scripts/auth_billing_public_identity_guard.sh
run_step "Auth session retention contract" npm run check:auth-session-retention-contract
run_step "Auth session kernel contract" npm run check:auth-session-kernel-contract
run_step "Account deletion quarantine contract" npm run check:account-delete-error-contract
run_step "No legacy Builder plan infra guard" npm run check:no-builder-plan-infra
run_step "Purchase token hygiene proof" npm run check:purchase-token-hygiene-proof
run_step "Frontend privacy hygiene proof" npm run check:frontend-privacy-hygiene-proof
run_step "Community admin contract guard" bash scripts/community_admin_contract_guard.sh
run_step "Community public identity guard" bash scripts/community_public_identity_guard.sh
run_step "Community deletion quarantine behavior" npm run check:community-cognition-cleanup-behavior
run_step "Community access role policy proof" npm run check:community-access-role-policy-proof
run_step "Community presence lease proof" npm run check:community-presence-lease-proof
run_step "Community typing presence proof" npm run check:community-typing-presence-proof
run_step "Direct-message contract proof" npm run check:direct-messages-contract-proof
run_step "Direct-message typing behavior" npm run check:direct-message-typing-presence-behavior
run_step "Community subscription lifecycle policy proof" npm run check:community-subscription-lifecycle-policy-proof
run_step "Runtime turn contract guard" bash scripts/runtime_turn_contract_guard.sh
run_step "Thread runtime marker retirement proof" npm run check:thread-runtime-marker-retirement-proof
run_step "Canonical operation surface proof" npm run check:canonical-operation-surface-proof
run_step "Community semantic repository proof" npm run check:community-semantic-repository-proof
run_step "AI Feed retirement Release A proof" npm run check:community-ai-feed-retirement-release-a-proof
run_step "Community evidence integrity proof" npm run check:community-evidence-integrity-proof
run_step "Runtime tool policy proof" npm run check:runtime-tool-policy-proof
run_step "Runtime input budget proof" npm run check:runtime-input-budget-proof
run_step "Runtime persisted-history pagination proof" npm run check:runtime-persisted-history-pagination-proof
run_step "Platform cost safety contract" npm run check:platform-cost-safety-contract-proof
run_step "Product documentation truth proof" npm run check:product-docs-index-proof
run_step "Product documentation runtime proof" npm run check:product-docs-runtime-tool-proof
run_step "Member entry destination contract" npm run check:member-entry-destination-contract
run_step "Community activity events proof" npm run check:community-activity-events-proof
run_step "Community member entry retirement contract" npm run check:community-member-entry-retirement
run_step "Community interaction projection UI proof" npm run check:community-interaction-projection-ui-proof
run_step "Community settings client version contract" npm run check:community-settings-client-version-contract
run_step "Community founder welcome contract" npm run check:community-founder-welcome-proof
run_step "Community channel UI proof" npm run check:community-channel-ui-proof
run_step "Community attention realtime behavior" npm run check:community-attention-realtime
run_step "No third-party MCP surface proof" npm run check:no-third-party-mcp-surface-proof
run_step "Cached production client compatibility proof" npm run check:cached-production-client-compatibility-proof
run_step "Official Polynet MCP contract proof" npm run check:polynet-workspace-mcp-proof
run_step "Official Polynet MCP authorization proof" npm run check:polynet-workspace-mcp-auth-proof
run_step "App shell decomposition contract" npm run check:app-shell-decomposition-contract
run_step "Web route access boundary proof" npm run check:web-route-access-boundary-proof
run_step "Founder inference contract proof" npm run check:founder-inference-proof
run_step "Founder inference behavior" npm run check:founder-inference-behavior
run_step "Monetization irreducibility contract" npm run check:monetization-irreducibility-proof
run_step "Canonical Builder offer surface contract" npm run check:builder-offer-surface-proof
run_step "Operator complimentary access contract" npm run check:operator-complimentary-access-proof
run_step "Community commerce economics contract" npm run check:community-commerce-economics-proof
run_step "Community commerce economics behavior" npm run check:community-commerce-economics-behavior
run_step "Repository behavior tests" npm test
run_step "No legacy provider repo guard" bash scripts/no_legacy_provider_repo_guard.sh
run_step "No legacy runtime-lane wording guard" bash scripts/no_platform_fallback_guard.sh

echo "PASS: foundation baseline gate passed."
