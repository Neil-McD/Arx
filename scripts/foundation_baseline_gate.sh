#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Foundation baseline gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

TOTAL_STEPS=13
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

run_step "Supabase CLI version contract" bash scripts/supabase_cli_contract_check.sh
run_step "Supabase migration filename contract" bash scripts/supabase_migration_filename_guard.sh
run_step "Supabase DB lint contract" bash scripts/supabase_db_lint_contract_check.sh
run_step "Irreducible core contract guard" bash scripts/irreducible_core_contract_guard.sh
run_step "Community AI-agent single-slot contract" bash scripts/community_agent_single_slot_contract_check.sh
run_step "Secret redaction contract check" bash scripts/secret_redaction_contract_check.sh
run_step "Cloud payment-provider-events hardening contract" bash scripts/cloud_payment_provider_events_hardening_check.sh
run_step "Edge verify_jwt default guard" bash scripts/edge_verify_jwt_default_guard.sh
run_step "Auth + money + access matrix contract" bash scripts/auth_money_access_matrix_check.sh
run_step "Runtime turn idempotency scope contract" bash scripts/runtime_turn_idempotency_scope_check.sh
run_step "Desktop agent lane contract" bash scripts/desktop_agent_lane_contract_guard.sh
run_step "Community edge deploy path guard" bash scripts/community_edge_deploy_path_guard.sh
run_step "Community edge deployment manifest contract" bash scripts/community_edge_deployment_contract_check.sh

echo "PASS: foundation baseline gate passed."
