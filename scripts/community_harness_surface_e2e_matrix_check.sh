#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_SEND_FLOW_FILE="shared/useWebSendFlowController.ts"
WEB_TURN_RUNNER_FILE="shared/useWebTurnRunnerController.ts"
DESKTOP_CLOUD_CHAT_API_FILE="src/services/thread/createDesktopCloudChatThreadApi.ts"
DESKTOP_RUNTIME_MAIN_FILE="src-tauri/src/main.rs"
DESKTOP_RUNTIME_TOOLS_FILE="src-tauri/src/runtime_tools.rs"
DESKTOP_COMMUNITY_CONTEXT_FILE="src-tauri/src/community_context.rs"
CLOUD_AGENT_TURN_FILE="supabase/functions/agent_turn/index.ts"
COMMUNITY_LANE_MESSAGE_BUILDER_FILE="shared/communityLaneMessageBuilder.ts"

run_cargo_test_with_retry() {
  local filter="$1"
  if (cd src-tauri && cargo test -q "$filter"); then
    return 0
  fi
  echo "WARN: cargo test failed once for '$filter'; retrying once..."
  (cd src-tauri && cargo test -q "$filter")
}

echo "== Community harness surface e2e matrix checks =="

echo "[1/10] Web chat (public lane) must preflight community evidence and inject it..."
grep -q "resolveCommunityPreflight" "$WEB_SEND_FLOW_FILE" \
  || { echo "FAIL: web send flow is missing community preflight resolver"; exit 1; }
grep -q "communityEvidenceUserMessage: communityPreflight?.communityEvidenceUserMessage ?? null" "$WEB_SEND_FLOW_FILE" \
  || { echo "FAIL: web public lane is not injecting preflight community evidence"; exit 1; }

echo "[2/10] Web chat (paid lane) must call canonical cloud agent_turn..."
grep -q '`\${url}/functions/v1/agent_turn`' "$WEB_TURN_RUNNER_FILE" \
  || { echo "FAIL: web turn runner is not calling /functions/v1/agent_turn"; exit 1; }

echo "[3/10] Desktop chat (public lane) must preflight community evidence..."
grep -q "loadCloudCommunityContextPreflight" "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat API missing community preflight loader"; exit 1; }
grep -q "prependCommunityPreludeMessages" "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat is not using canonical community prelude message assembly"; exit 1; }
grep -q "communityEvidenceUserMessage: communityPreflight.communityEvidenceUserMessage" "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat public lane is not passing preflight evidence into lane messages"; exit 1; }

echo "[4/10] Desktop ChatGPT lane must receive canonical community evidence guidance..."
grep -q "buildChatgptLaneMessages" "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat API missing lane message adapter"; exit 1; }
grep -q "communityEvidenceUserMessage: prepared.communityPreflight.communityEvidenceUserMessage" "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat API missing ChatGPT lane message adaptation"; exit 1; }
grep -q 'Do not claim you cannot access community chat/resources/memory' "$COMMUNITY_LANE_MESSAGE_BUILDER_FILE" \
  || { echo "FAIL: desktop ChatGPT lane missing community evidence truthfulness guardrail"; exit 1; }

echo "[5/10] User-facing output must be sanitized through the shared canonical helper..."
grep -q "communityUserFacingOutputSanitizer.mjs" "$WEB_TURN_RUNNER_FILE" \
  || { echo "FAIL: web turn runner is not using shared user-facing output sanitizer"; exit 1; }
grep -q "communityUserFacingOutputSanitizer.mjs" "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat is not using shared user-facing output sanitizer"; exit 1; }
grep -q "sanitizeUserFacingAssistantText" "$CLOUD_AGENT_TURN_FILE" \
  || { echo "FAIL: cloud agent_turn is not sanitizing user-facing assistant output"; exit 1; }

echo "[6/10] Desktop chat (paid lane) must call canonical cloud agent_turn..."
grep -q '`\${url}/functions/v1/agent_turn`' "$DESKTOP_CLOUD_CHAT_API_FILE" \
  || { echo "FAIL: desktop cloud chat paid lane is not calling /functions/v1/agent_turn"; exit 1; }

echo "[7/10] Desktop agent lane must expose community tools in allowed runtime surface..."
grep -q "agent_lane_exposes_coding_and_community_tools" "$DESKTOP_RUNTIME_MAIN_FILE" \
  || { echo "FAIL: missing desktop agent lane + community tools contract test"; exit 1; }
grep -q '"community_search"' "$DESKTOP_RUNTIME_MAIN_FILE" \
  || { echo "FAIL: desktop runtime is missing community_search in lane/tool contract coverage"; exit 1; }
grep -q '"community_memory_candidate_propose"' "$DESKTOP_RUNTIME_MAIN_FILE" \
  || { echo "FAIL: desktop runtime is missing community_memory_candidate_propose in lane/tool contract coverage"; exit 1; }

echo "[8/10] Desktop runtime community_search must route through canonical community_research..."
grep -q "search_community_via_canonical_harness_strict" "$DESKTOP_RUNTIME_TOOLS_FILE" \
  || { echo "FAIL: desktop runtime tools are not routing community_search through canonical harness"; exit 1; }
grep -q 'COMMUNITY_FUNCTION_RESEARCH: &str = "community_research"' "$DESKTOP_COMMUNITY_CONTEXT_FILE" \
  || { echo "FAIL: desktop community context adapter missing canonical community_research function binding"; exit 1; }

echo "[9/10] Cloud agent_turn must use canonical community retrieval orchestrator only..."
grep -q "runCanonicalCommunitySearch" "$CLOUD_AGENT_TURN_FILE" \
  || { echo "FAIL: cloud agent_turn missing canonical runCanonicalCommunitySearch usage"; exit 1; }
! grep -q "search_compiled_community_context" "$CLOUD_AGENT_TURN_FILE" \
  || { echo "FAIL: cloud agent_turn should not directly call search_compiled_community_context"; exit 1; }
! grep -q "search_community_chat_snippets" "$CLOUD_AGENT_TURN_FILE" \
  || { echo "FAIL: cloud agent_turn should not directly call search_community_chat_snippets"; exit 1; }
! grep -q "search_community_resource_snippets" "$CLOUD_AGENT_TURN_FILE" \
  || { echo "FAIL: cloud agent_turn should not directly call search_community_resource_snippets"; exit 1; }
! grep -q "search_community_memory_items" "$CLOUD_AGENT_TURN_FILE" \
  || { echo "FAIL: cloud agent_turn should not directly call search_community_memory_items"; exit 1; }

echo "[10/10] Runtime behavior tests for community_search parity + safety..."
run_cargo_test_with_retry "lane_tool_contract_tests::agent_lane_exposes_coding_and_community_tools"
run_cargo_test_with_retry "community_action_tool_event_tests::community_search_falls_back_when_compiled_is_empty"
run_cargo_test_with_retry "community_action_tool_event_tests::community_search_meta_query_retries_with_recent_fallback_when_first_pass_is_empty"
run_cargo_test_with_retry "community_action_tool_event_tests::community_search_memory_mode_is_read_only_and_skips_approval_event"

echo "PASS: community harness surface e2e matrix checks passed."
