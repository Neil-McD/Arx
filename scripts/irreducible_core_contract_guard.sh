#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CORE_DOC="docs/irreducible-core-contract.md"
DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
COMMUNITY_NAV="shared/CommunityNav.tsx"
COMMUNITY_DRAFTS="shared/useCommunityAgentDraftController.ts"
COMMUNITY_AGENT_LANDING_LIFECYCLE="shared/useCommunityAgentLandingLifecycle.ts"
DESKTOP_CLOUD_CHAT="src/services/thread/createDesktopCloudChatThreadApi.ts"
COMMUNITY_CONTEXT_RS="src-tauri/src/community_context.rs"
AGENT_TURN_FN="supabase/functions/agent_turn/index.ts"
COMMUNITY_RESEARCH_FN="supabase/functions/community_research/index.ts"
MEMORY_CANDIDATES_SHARED="shared/communityMemoryCandidates.ts"
VOICE_WEB_CONTROLLER="shared/useWebVoiceInputController.ts"
VOICE_DESKTOP_CONTROLLER="src/controllers/desktop/useDesktopVoiceInputController.ts"
BUILDER_BILLING_CORE="shared/useBuilderBillingActionsCore.ts"
PUBLIC_FUNNEL_FN="supabase/functions/public_funnel/index.ts"
DEPLOY_MANIFEST="supabase/functions/deployment-manifest.json"
MIGRATIONS_DIR="supabase/migrations"

require_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  rg -F -q "$pattern" "$file" || {
    echo "FAIL: $message"
    exit 1
  }
}

require_migration_pattern() {
  local pattern="$1"
  local message="$2"
  if ! rg -n --glob '*.sql' "$pattern" "$MIGRATIONS_DIR" >/dev/null; then
    echo "FAIL: $message"
    exit 1
  fi
}

echo "== Irreducible core contract guard =="

echo "[1/8] Core contract doc must exist and name the non-negotiable surfaces..."
test -f "$CORE_DOC" || {
  echo "FAIL: missing $CORE_DOC"
  exit 1
}
for heading in \
  "Canonical Surface Keep-List" \
  "Community Surface (Must Keep)" \
  "Inference and Auth (Must Keep)" \
  "Monetization Rails (Must Keep)" \
  "Voice UX (Must Keep)"; do
  require_contains "$CORE_DOC" "$heading" "core contract doc missing heading '$heading'"
done

echo "[2/8] Desktop + web community nav must retain canonical tab IDs..."
for tab in chat library resources members settings ai_agent analytics; do
  require_contains "$DESKTOP_APP" "communityTab === \"$tab\"" "desktop missing community tab id '$tab'"
  require_contains "$WEB_APP" "communityTab === \"$tab\"" "web missing community tab id '$tab'"
done

echo "[3/8] Canonical community nav labels must remain in shared nav source..."
require_contains "$DESKTOP_APP" "<CommunityNav" "desktop app missing shared CommunityNav wiring"
require_contains "$WEB_APP" "<CommunityNav" "web app missing shared CommunityNav wiring"
for label in "Chat" "Library" "Resources" "Members" "Settings" "AI Agent" "Analytics"; do
  require_contains "$COMMUNITY_NAV" "$label" "shared community nav missing tab label '$label'"
done

echo "[4/8] Community AI-agent draft lane must remain wired..."
require_contains "$DESKTOP_APP" "useCommunityAgentDraftController" "desktop missing AI-agent draft controller"
require_contains "$WEB_APP" "useCommunityAgentDraftController" "web missing AI-agent draft controller"
require_contains "$DESKTOP_APP" "useCommunityAgentLandingLifecycle" "desktop missing AI-agent landing lifecycle wiring"
require_contains "$WEB_APP" "useCommunityAgentLandingLifecycle" "web missing AI-agent landing lifecycle wiring"
for rpc in list_community_agent_drafts upsert_community_agent_draft set_active_community_agent_draft; do
  require_contains "$COMMUNITY_DRAFTS" "$rpc" "community draft controller missing RPC '$rpc'"
done
require_contains "$DESKTOP_CLOUD_CHAT" "get_active_community_agent_system_prompt" "desktop cloud chat missing active community system prompt RPC"
require_contains "$COMMUNITY_AGENT_LANDING_LIFECYCLE" "get_active_community_agent_landing" "shared landing lifecycle missing active community landing RPC"

echo "[5/8] Community research harness must remain wired end-to-end..."
require_contains "$DEPLOY_MANIFEST" "\"slug\": \"community_research\"" "deployment manifest missing community_research function"
require_contains "$COMMUNITY_CONTEXT_RS" "community_research" "desktop community context missing community_research endpoint usage"
require_contains "$COMMUNITY_RESEARCH_FN" "runCanonicalCommunitySearch" "community_research function missing canonical search path"
require_contains "$COMMUNITY_RESEARCH_FN" "runCanonicalCommunityDeepResearch" "community_research function missing deep research path"
require_contains "$AGENT_TURN_FN" "community_research_orchestrator" "agent_turn missing shared community research orchestrator wiring"

echo "[6/8] Community memory candidate harness must remain wired..."
for symbol in \
  listCommunityMemoryCandidatesRpc \
  proposeCommunityMemoryCandidateRpc \
  promoteCommunityMemoryCandidateRpc \
  rejectCommunityMemoryCandidateRpc; do
  require_contains "$MEMORY_CANDIDATES_SHARED" "$symbol" "community memory candidates missing '$symbol'"
done
require_contains "$DESKTOP_APP" "communityMemoryCandidates" "desktop app missing community memory candidate UI flow"
require_migration_pattern "community_memory_candidate_propose" "missing community_memory_candidate_propose RPC"
require_migration_pattern "community_memory_candidate_promote" "missing community_memory_candidate_promote RPC"
require_migration_pattern "community_memory_candidate_reject" "missing community_memory_candidate_reject RPC"

echo "[7/8] Voice must remain wired across desktop + web + edge..."
require_contains "$DESKTOP_APP" "useDesktopVoiceInputController" "desktop app missing voice controller wiring"
require_contains "$WEB_APP" "useWebVoiceInputController" "web app missing voice controller wiring"
require_contains "$VOICE_DESKTOP_CONTROLLER" "/functions/v1/voice_transcribe" "desktop voice controller missing voice_transcribe call"
require_contains "$VOICE_WEB_CONTROLLER" "/functions/v1/voice_transcribe" "web voice controller missing voice_transcribe call"
require_contains "$DEPLOY_MANIFEST" "\"slug\": \"voice_transcribe\"" "deployment manifest missing voice_transcribe function"

echo "[8/8] Builder monetization rails must remain wired (including Connect)..."
for slug in builder_billing_portal builder_checkout_start connect_onboard_start checkout_start checkout_finalize stripe_webhook; do
  require_contains "$DEPLOY_MANIFEST" "\"slug\": \"$slug\"" "deployment manifest missing monetization slug '$slug'"
done
require_contains "$BUILDER_BILLING_CORE" "/functions/v1/builder_checkout_start" "builder billing core missing builder checkout endpoint"
require_contains "$BUILDER_BILLING_CORE" "/functions/v1/builder_billing_portal" "builder billing core missing billing portal endpoint"
require_contains "$BUILDER_BILLING_CORE" "/functions/v1/connect_onboard_start" "builder billing core missing connect onboard endpoint"
require_contains "$PUBLIC_FUNNEL_FN" "/functions/v1/checkout_start" "public funnel missing checkout_start chain"

echo "PASS: irreducible core contract guard passed."
