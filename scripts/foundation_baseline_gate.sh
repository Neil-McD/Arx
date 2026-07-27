#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Foundation baseline gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

TOTAL_STEPS=47
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
run_step "Community launcher retirement contract" npm run check:community-launcher-retirement-proof
run_step "Global Settings surface contract" npm run check:global-settings-surface-contract
run_step "Personal Account orchestration contract" npm run check:personal-account-settings-orchestration-proof
run_step "Account setup surface contract" npm run check:account-setup-surface-orchestration-proof
run_step "Community Funnel editor contract" npm run check:community-funnel-editor-contract-proof
run_step "Member agent dock contract" npm run check:member-agent-dock-proof
run_step "Cached-client member-entry compatibility contract" npm run check:cached-client-member-entry-compatibility-contract
run_step "Legacy route surface guard" bash scripts/legacy_route_surface_guard.sh
run_step "No compat RPC primitive guard" bash scripts/no_compat_rpc_primitive_guard.sh
run_step "Auth env contract guard" bash scripts/auth_env_contract_guard.sh
run_step "No direct legacy-auth imports guard" bash scripts/no_direct_legacy_auth_imports_guard.sh
run_step "Legacy function transport surface guard" bash scripts/legacy_function_transport_surface_guard.sh
run_step "Convex client surface guard" bash scripts/convex_client_surface_guard.sh
run_step "Convex verified identity guard" bash scripts/convex_verified_identity_guard.sh
run_step "Auth bootstrap public identity guard" bash scripts/auth_bootstrap_public_identity_guard.sh
run_step "Auth and billing public identity guard" bash scripts/auth_billing_public_identity_guard.sh
run_step "Canonical account entitlement authority guard" npm run check:account-entitlement-authority-guard
run_step "Canonical account entitlement behavior" npm run test:account-entitlement-authority
run_step "Auth actor subject authority behavior" npm run test:auth-actor-subject-authority
run_step "Auth session secure identifier behavior" npm run test:auth-session-security
run_step "Auth session persisted state machine" npm run test:auth-session-state-machine
run_step "No legacy Builder plan infra guard" npm run check:no-builder-plan-infra
run_step "Checkout route hygiene proof" npm run check:checkout-route-hygiene-proof
run_step "Frontend privacy hygiene proof" npm run check:frontend-privacy-hygiene-proof
run_step "Account deletion quarantine contract" npm run check:account-delete-error-contract
run_step "Account deletion safety behavior" npm run test:account-deletion-safety
run_step "Community evidence revocation behavior" npm run test:community-evidence-revocation
run_step "Email content retention behavior" npm run test:weekly-community-digest
run_step "Community deletion quarantine contract" npm run check:community-deletion-quarantine-contract
run_step "Community deletion safety behavior" npm run test:community-deletion-safety
run_step "Community membership fail-closed authority" npm run test:community-membership-authority
run_step "Public funnel admission freshness contract" npm run check:community-funnel-load-contract
run_step "Public checkout-start behavior" npm run test:public-community-checkout-start
run_step "Public checkout-start contract" npm run check:public-community-checkout-start-contract
run_step "Community subscription event convergence" npm run test:community-subscription-event-convergence
run_step "Account lifecycle policy contract" npm run check:account-lifecycle-policy-contract
run_step "Operational recovery contract" npm run check:operational-recovery-contract
run_step "Community admin contract guard" bash scripts/community_admin_contract_guard.sh
run_step "Community public identity guard" bash scripts/community_public_identity_guard.sh
run_step "Community access role policy proof" npm run check:community-access-role-policy-proof
run_step "Paid community access authority" npm run test:community-paid-access-authority
run_step "Critical audit event coverage" npm run check:critical-audit-events-proof
run_step "Runtime turn contract guard" bash scripts/runtime_turn_contract_guard.sh
run_step "No legacy provider repo guard" bash scripts/no_legacy_provider_repo_guard.sh
run_step "No legacy runtime-lane wording guard" bash scripts/no_platform_fallback_guard.sh

echo "PASS: foundation baseline gate passed."
