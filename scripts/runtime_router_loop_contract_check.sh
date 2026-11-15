#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/guard_rg_compat.sh"

require() {
  local file="$1" pattern="$2" description="$3"
  rg -n -S "$pattern" "$file" >/dev/null || {
    echo "FAIL: missing contract marker: $description"
    exit 1
  }
  echo "OK: $description"
}

forbid() {
  local file="$1" pattern="$2" description="$3"
  if rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: forbidden pattern detected: $description"
    rg -n -S "$pattern" "$file" || true
    exit 1
  fi
  echo "OK: $description"
}

HANDLERS="$ROOT/convex/runtimeTurnHandlers.ts"
RESOLUTION="$ROOT/convex/runtimeTurnResolution.ts"
LOOP="$ROOT/convex/runtimeAgentLoop.ts"
TOOLS="$ROOT/shared/retrievalTools.ts"
PROMPT="$ROOT/shared/runtimePrompt.ts"

echo "== Runtime router/loop contract guard =="
require "$RESOLUTION" 'LENS_TOOLS\[guideRunLens\(' "a private talk's tools come from its lens"
forbid "$RESOLUTION" 'CapabilityFamil|canonicalGateEngine|restrictToolNamesForInvocationSurface' "capability families and the surface allowlist stay deleted"
require "$HANDLERS" 'executeChatToolsAgentLoop\(' "one governed agent loop handles native turns"
require "$HANDLERS" 'executionMode: "agentic"' "runtime persists one canonical execution mode"
require "$LOOP" 'runFundedCommunityAgent\(\{' "a private talk runs on the one run entry"
forbid "$LOOP" 'runPiRuntimeKernel|runOpenAiNativeToolCompletion|claimCommunityInferenceFundingSession' "a private talk has no Pi loop, model call or funding claim of its own"
require "$PROMPT" 'Use native tool calls\. Do not describe tool calls in JSON or markdown\.' "prompt requires native tool calls"
forbid "$HANDLERS" 'runtimeExecutionMode|capability_composed_chat_v1|legacy_project_workspace' "legacy runtime branches stay deleted"
forbid "$LOOP" 'runtimeExecutionSession|workspaceRuntime|workspaceTerminals|daytonaCodexRuntime|executeTerminalTool|executeComputerTool' "agent loop cannot reach Workspace execution"
forbid "$PROMPT" 'workspace_harness_context|PLATFORM_HARNESS_CONTEXT|terminal_start|computer_screenshot' "prompt cannot advertise Workspace capabilities"
forbid "$TOOLS" '"list_dir"|"bash"|"terminal_start"|"computer_screenshot"' "retired Workspace tools stay outside the model tool type"
for tool in polynet_list polynet_read polynet_search polynet_write polynet_call web_research; do
  require "$TOOLS" "\"$tool\"" "active tool type includes $tool"
done
# No lens offers them; deleted with their chains (engine cleanup).
forbid "$TOOLS" '"search_product_docs"|"get_product_doc"|"member_conversations_list"|"member_conversation_read"|"member_profile_confirm_facts"|"web_crawl"' "retired tools stay outside the model tool type"

node --experimental-strip-types --experimental-specifier-resolution=node "$ROOT/scripts/runtime_tool_loop_proof.ts"
echo "runtime_router_loop_contract_check: ok"
