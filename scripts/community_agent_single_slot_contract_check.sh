#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SINGLE_SLOT_MIGRATION="supabase/migrations/20260221201500_cloud_community_agent_draft_single_slot_contract.sql"
DRAFT_CONTROLLER="shared/useCommunityAgentDraftController.ts"
EDITOR_UI_CONTROLLER="shared/useCommunityAgentEditorUiController.ts"
DESKTOP_AI_AGENT_TAB="src/components/DesktopCommunityAiAgentTab.tsx"
WEB_AI_AGENT_EDITOR="apps/web/src/components/WebCommunityAiAgentLandingEditor.tsx"

require_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  rg -F -q "$pattern" "$file" || {
    echo "FAIL: $message"
    exit 1
  }
}

echo "== Community AI-agent single-slot contract check =="

echo "[1/6] Single-slot migration must exist..."
test -f "$SINGLE_SLOT_MIGRATION" || {
  echo "FAIL: missing $SINGLE_SLOT_MIGRATION"
  exit 1
}

echo "[2/6] DB contract must enforce slot=1 semantics..."
require_contains "$SINGLE_SLOT_MIGRATION" "alter column slot set default 1;" "slot default must be 1"
require_contains "$SINGLE_SLOT_MIGRATION" "check (slot = 1);" "slot check must enforce slot=1"
require_contains "$SINGLE_SLOT_MIGRATION" "unique (community_id);" "community draft uniqueness must be per-community single row"
require_contains "$SINGLE_SLOT_MIGRATION" "slot must be 1" "RPC layer must reject non-slot-1 calls"

echo "[3/6] UI/controller layer must not keep selected-slot state..."
if rg -n 'communityAgentSelectedSlot|setCommunityAgentSelectedSlot' src apps/web/src shared >/dev/null; then
  echo "FAIL: selected-slot state references still exist in app/controller layer"
  exit 1
fi

echo "[4/6] Draft controller must pin write path to primary slot..."
require_contains "$DRAFT_CONTROLLER" "const COMMUNITY_AGENT_PRIMARY_SLOT = 1;" "draft controller missing primary slot constant"
require_contains "$DRAFT_CONTROLLER" "p_slot: COMMUNITY_AGENT_PRIMARY_SLOT" "draft controller save/set-live must use primary slot"

echo "[5/6] Editor controllers/components must pin read path to primary slot..."
require_contains "$EDITOR_UI_CONTROLLER" "const COMMUNITY_AGENT_PRIMARY_SLOT = 1;" "editor UI controller missing primary slot constant"
require_contains "$DESKTOP_AI_AGENT_TAB" "const COMMUNITY_AGENT_PRIMARY_SLOT = 1;" "desktop AI-agent tab missing primary slot constant"
require_contains "$WEB_AI_AGENT_EDITOR" "const COMMUNITY_AGENT_PRIMARY_SLOT = 1;" "web AI-agent editor missing primary slot constant"

echo "[6/6] Template-menu surface must stay removed..."
if rg -n 'agent-template-' src apps/web/src shared >/dev/null; then
  echo "FAIL: template-menu CSS/markup surface reintroduced"
  exit 1
fi

echo "PASS: community AI-agent single-slot contract check passed."
