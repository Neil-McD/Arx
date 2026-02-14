#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Community core checks =="

echo "[1/30] Community context parity..."
node scripts/community_context_parity_check.mjs
(cd src-tauri && cargo test -q community_context_contract_fixture_tests::)

echo "[2/30] Community harness write guard..."
bash scripts/community_harness_write_guard_check.sh

echo "[3/30] Community harness contract guard..."
bash scripts/community_harness_contract_regression_check.sh

echo "[4/30] Thread context regression..."
bash scripts/thread_context_regression_check.sh

echo "[5/30] Thread context E2E matrix..."
bash scripts/thread_context_e2e_matrix_check.sh

echo "[6/30] Sidebar selector regression..."
bash scripts/sidebar_selector_regression_check.sh

echo "[7/30] Thread panel controller regression..."
bash scripts/thread_panel_controller_regression_check.sh

echo "[8/30] Thread sidebar component regression..."
bash scripts/thread_sidebar_component_regression_check.sh

echo "[9/30] Thread session item component regression..."
bash scripts/thread_session_item_component_regression_check.sh

echo "[10/30] Desktop topbar component regression..."
bash scripts/desktop_topbar_component_regression_check.sh

echo "[11/30] Desktop community rail component regression..."
bash scripts/desktop_community_rail_component_regression_check.sh

echo "[12/30] Desktop run orchestration controller regression..."
bash scripts/desktop_run_orchestration_controller_regression_check.sh

echo "[12b] Desktop workspace attachment controller regression..."
bash scripts/desktop_workspace_attachment_controller_regression_check.sh

echo "[12c] Desktop settings image-upload controller regression..."
bash scripts/desktop_settings_image_upload_controller_regression_check.sh

echo "[13/30] Community chat data controller regression..."
bash scripts/community_chat_data_controller_regression_check.sh

echo "[14/30] Community chat mutation controller regression..."
bash scripts/community_chat_mutation_controller_regression_check.sh

echo "[15/30] Community invite controller regression..."
bash scripts/community_invite_controller_regression_check.sh

echo "[16/30] Community create controller regression..."
bash scripts/community_create_controller_regression_check.sh

echo "[17/30] Community resource controller regression..."
bash scripts/community_resource_controller_regression_check.sh

echo "[18/30] Community resource editor controller regression..."
bash scripts/community_resource_editor_controller_regression_check.sh

echo "[19/30] Community admin controller regression..."
bash scripts/community_admin_controller_regression_check.sh

echo "[19b] Community delete controller regression..."
bash scripts/community_delete_controller_regression_check.sh

echo "[20/30] Community settings form controller regression..."
bash scripts/community_settings_form_controller_regression_check.sh

echo "[21/30] Community settings data controller regression..."
bash scripts/community_settings_data_controller_regression_check.sh

echo "[22/30] Community settings/governance controller regression..."
bash scripts/community_settings_governance_controller_regression_check.sh

echo "[23/30] Community AI-agent draft controller regression..."
bash scripts/community_agent_draft_controller_regression_check.sh

echo "[24/30] Community members-review controller regression..."
bash scripts/community_members_review_controller_regression_check.sh

echo "[25/30] App shell boundary guard..."
bash scripts/app_shell_boundary_check.sh

echo "[26/30] App shell shared helpers regression..."
bash scripts/app_shell_shared_helpers_regression_check.sh

echo "[26b] Builder-upgrade scroll-hint regression..."
bash scripts/builder_upgrade_scroll_hint_regression_check.sh

echo "[26c] Workspace auto-scroll regression..."
bash scripts/workspace_auto_scroll_regression_check.sh

echo "[26d] Model picker controller regression..."
bash scripts/model_picker_controller_regression_check.sh

echo "[26e] Model picker lifecycle regression..."
bash scripts/model_picker_lifecycle_regression_check.sh

echo "[26f] Community-agent template-menu lifecycle regression..."
bash scripts/community_agent_template_menu_lifecycle_regression_check.sh

echo "[26g] Auth-gate lifecycle regression..."
bash scripts/auth_gate_lifecycle_regression_check.sh

echo "[26h] Community-agent renaming reset regression..."
bash scripts/community_agent_renaming_reset_regression_check.sh

echo "[26i] Community-agent preview-tab fallback regression..."
bash scripts/community_agent_preview_tab_fallback_regression_check.sh

echo "[26j] Web app init-order guard..."
bash scripts/web_app_init_order_guard.sh

echo "[27/30] Inline citation regression..."
node scripts/inline_citation_regression_check.mjs

echo "[28/30] Billing/funnel controller regression..."
bash scripts/billing_funnel_controller_regression_check.sh

echo "[29/30] Public funnel controller regression..."
bash scripts/public_funnel_controller_regression_check.sh

echo "[30/32] Auth core regression..."
bash scripts/auth_core_regression_check.sh

echo "[31/32] DB write-path contract guard..."
bash scripts/db_write_path_contract_guard.sh

echo "[32/32] Workspace identity contract guard..."
bash scripts/workspace_identity_contract_guard.sh

echo "PASS: community core checks passed."
