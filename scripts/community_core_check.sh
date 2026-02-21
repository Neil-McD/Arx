#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Community core checks =="

TOTAL_STEPS=42
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

# Canonical base harness runner for shared failure-path coverage.
run_step "Canonical harness failure-path matrix" bash scripts/harness_failure_matrix_check.sh

run_step "Thread context regression" bash scripts/thread_context_regression_check.sh
run_step "Thread context E2E matrix" bash scripts/thread_context_e2e_matrix_check.sh
run_step "Sidebar selector regression" bash scripts/sidebar_selector_regression_check.sh
run_step "Thread panel controller regression" bash scripts/thread_panel_controller_regression_check.sh
run_step "Thread sidebar component regression" bash scripts/thread_sidebar_component_regression_check.sh
run_step "Thread session item component regression" bash scripts/thread_session_item_component_regression_check.sh
run_step "Desktop topbar component regression" bash scripts/desktop_topbar_component_regression_check.sh
run_step "Desktop community rail component regression" bash scripts/desktop_community_rail_component_regression_check.sh
run_step "Desktop run orchestration controller regression" bash scripts/desktop_run_orchestration_controller_regression_check.sh
run_step "Desktop workspace attachment controller regression" bash scripts/desktop_workspace_attachment_controller_regression_check.sh
run_step "Desktop settings image-upload controller regression" bash scripts/desktop_settings_image_upload_controller_regression_check.sh
run_step "Community chat data controller regression" bash scripts/community_chat_data_controller_regression_check.sh
run_step "Community chat mutation controller regression" bash scripts/community_chat_mutation_controller_regression_check.sh
run_step "Community invite controller regression" bash scripts/community_invite_controller_regression_check.sh
run_step "Community create controller regression" bash scripts/community_create_controller_regression_check.sh
run_step "Community resource controller regression" bash scripts/community_resource_controller_regression_check.sh
run_step "Community resource editor controller regression" bash scripts/community_resource_editor_controller_regression_check.sh
run_step "Community admin controller regression" bash scripts/community_admin_controller_regression_check.sh
run_step "Community delete controller regression" bash scripts/community_delete_controller_regression_check.sh
run_step "Community settings form controller regression" bash scripts/community_settings_form_controller_regression_check.sh
run_step "Community settings data controller regression" bash scripts/community_settings_data_controller_regression_check.sh
run_step "Community settings/governance controller regression" bash scripts/community_settings_governance_controller_regression_check.sh
run_step "Community AI-agent draft controller regression" bash scripts/community_agent_draft_controller_regression_check.sh
run_step "Community members-review controller regression" bash scripts/community_members_review_controller_regression_check.sh
run_step "App shell boundary guard" bash scripts/app_shell_boundary_check.sh
run_step "App shell shared helpers regression" bash scripts/app_shell_shared_helpers_regression_check.sh
run_step "Builder-upgrade scroll-hint regression" bash scripts/builder_upgrade_scroll_hint_regression_check.sh
run_step "Workspace auto-scroll regression" bash scripts/workspace_auto_scroll_regression_check.sh
run_step "Model picker controller regression" bash scripts/model_picker_controller_regression_check.sh
run_step "Model picker lifecycle regression" bash scripts/model_picker_lifecycle_regression_check.sh
run_step "Community-agent template-menu lifecycle regression" bash scripts/community_agent_template_menu_lifecycle_regression_check.sh
run_step "Auth-gate lifecycle regression" bash scripts/auth_gate_lifecycle_regression_check.sh
run_step "Community-agent renaming reset regression" bash scripts/community_agent_renaming_reset_regression_check.sh
run_step "Community-agent preview-tab fallback regression" bash scripts/community_agent_preview_tab_fallback_regression_check.sh
run_step "Web app init-order guard" bash scripts/web_app_init_order_guard.sh
run_step "Inline citation regression" node scripts/inline_citation_regression_check.mjs
run_step "Billing/funnel controller regression" bash scripts/billing_funnel_controller_regression_check.sh
run_step "Public funnel controller regression" bash scripts/public_funnel_controller_regression_check.sh
run_step "Auth core regression" bash scripts/auth_core_regression_check.sh
run_step "DB write-path contract guard" bash scripts/db_write_path_contract_guard.sh
run_step "Workspace identity contract guard" bash scripts/workspace_identity_contract_guard.sh

echo "PASS: community core checks passed."
