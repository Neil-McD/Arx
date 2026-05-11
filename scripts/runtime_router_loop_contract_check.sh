#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Runtime router/loop contract guard =="

HTTP_FILE="$ROOT/convex/httpRuntimeRoutes.ts"
HANDLERS_FILE="$ROOT/convex/runtimeTurnHandlers.ts"
RESOLUTION_FILE="$ROOT/convex/runtimeTurnResolution.ts"
DAYTONA_FILE="$ROOT/convex/httpDaytona.ts"
HARNESS_TELEMETRY_FILE="$ROOT/convex/runtimeHarnessTelemetry.ts"
HARNESS_SHAPING_FILE="$ROOT/convex/runtimeHarnessShaping.ts"
TOOL_TYPES_FILE="$ROOT/shared/retrievalTools.ts"
NATIVE_LOOP_FILE="$ROOT/shared/nativeToolLoop.ts"
PROMPT_FILE="$ROOT/shared/runtimePrompt.ts"
ROUTER_FILE="$ROOT/shared/routerLevels.ts"

require_match_in_file() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

forbid_match_in_file() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: forbidden pattern detected: $description"
    rg -n -S "$pattern" "$file" || true
    exit 1
  fi
  echo "OK: $description"
}

if [[ -e "$ROUTER_FILE" ]]; then
  echo "FAIL: legacy router file still exists: $ROUTER_FILE"
  exit 1
fi
echo "OK: legacy router file deleted"

require_match_in_file "$RESOLUTION_FILE" 'function resolveAllowedToolNames\(' \
  "runtime derives allowed tools directly"
require_match_in_file "$HANDLERS_FILE" 'tool_policy_resolved' \
  "runtime emits tool_policy_resolved event"
require_match_in_file "$HANDLERS_FILE" 'executeChatToolsAgentLoop\(' \
  "runtime supports the unified tool loop"
forbid_match_in_file "$HANDLERS_FILE" 'executeWorkspaceAgentLoop\(' \
  "runtime no longer keeps a separate eager workspace agent loop"
require_match_in_file "$HANDLERS_FILE" 'runtimeExecutionMode === "agentic"' \
  "runtime branches on execution mode for tool-capable turns"

forbid_match_in_file "$HANDLERS_FILE" 'resolveRouterLevelDecision' \
  "runtime no longer references router level decisions"
forbid_match_in_file "$HANDLERS_FILE" 'ROUTER_LEVEL_TOOL_NAMES' \
  "runtime no longer references router tool bundles"
forbid_match_in_file "$HANDLERS_FILE" 'router_level_selected' \
  "runtime no longer emits router_level_selected"
forbid_match_in_file "$HANDLERS_FILE" 'debug_force_router_level' \
  "runtime no longer accepts debug_force_router_level"

require_match_in_file "$DAYTONA_FILE" 'function executeRetrievalAgentLoop\(' \
  "shared loop core still exists"
require_match_in_file "$DAYTONA_FILE" 'harnessName: "chat_tools"' \
  "runtime uses the unified chat_tools harness name"
forbid_match_in_file "$DAYTONA_FILE" 'harnessName: "workspace"' \
  "runtime no longer carries a separate workspace harness name"
require_match_in_file "$PROMPT_FILE" 'Use native tool calls\. Do not describe tool calls in JSON or markdown\.' \
  "workspace prompt instructs native tool calling"
require_match_in_file "$PROMPT_FILE" 'Use independent read-only tool calls in parallel when possible\.' \
  "workspace prompt encourages batched read-only tool calls"
require_match_in_file "$DAYTONA_FILE" 'runProviderNativeToolCompletion\(' \
  "workspace loop uses provider-native tool completion"
require_match_in_file "$DAYTONA_FILE" 'runNativeRuntimeKernel<' \
  "workspace loop uses explicit runtime kernel state machine"
require_match_in_file "$DAYTONA_FILE" 'from "./runtimeHarnessTelemetry"' \
  "workspace loop imports extracted runtime harness telemetry helpers"
require_match_in_file "$DAYTONA_FILE" 'from "./runtimeHarnessShaping"' \
  "workspace loop imports extracted runtime harness shaping helpers"
require_match_in_file "$DAYTONA_FILE" 'tool_batch_telemetry' \
  "workspace loop emits batch telemetry evidence"
require_match_in_file "$HARNESS_TELEMETRY_FILE" 'batch_wall_time_ms' \
  "workspace batch telemetry records wall time"
require_match_in_file "$HARNESS_TELEMETRY_FILE" 'estimated_parallel_savings_ms' \
  "workspace batch telemetry estimates parallel savings"
require_match_in_file "$HARNESS_TELEMETRY_FILE" 'parallel_blocker_reason_counts' \
  "workspace batch telemetry records blocker reasons"
require_match_in_file "$DAYTONA_FILE" 'createPolyNetExecutionSession\(' \
  "workspace loop creates a unified PolyNet execution session"
require_match_in_file "$DAYTONA_FILE" 'executionSession\.' \
  "workspace loop routes execution through the PolyNet execution session"
require_match_in_file "$DAYTONA_FILE" 'executionSession\.executeTerminalTool\(' \
  "workspace loop routes terminal tools through the execution session"
require_match_in_file "$DAYTONA_FILE" 'executionSession\.executeComputerTool\(' \
  "workspace loop routes computer tools through the execution session"
forbid_match_in_file "$DAYTONA_FILE" 'executeCommunityAgentLoop' \
  "community-specific loop wrapper removed"
forbid_match_in_file "$DAYTONA_FILE" 'executeExternalAgentLoop' \
  "external-specific loop wrapper removed"
forbid_match_in_file "$DAYTONA_FILE" 'parseRetrievalAgentDecision\(' \
  "workspace loop no longer parses JSON tool decisions"
forbid_match_in_file "$DAYTONA_FILE" 'Your previous response was not strict JSON' \
  "workspace loop no longer retries malformed JSON tool decisions"
forbid_match_in_file "$DAYTONA_FILE" 'Allowed JSON outputs:' \
  "workspace prompt no longer teaches JSON tool wrapper format"
forbid_match_in_file "$DAYTONA_FILE" 'createRuntimeMcpManager\(' \
  "workspace loop no longer instantiates MCP managers inline"
forbid_match_in_file "$DAYTONA_FILE" 'createRuntimeMountedToolExposureState\(' \
  "workspace loop no longer instantiates mounted tool exposure state inline"
forbid_match_in_file "$DAYTONA_FILE" 'function buildToolBatchTelemetryPayload\(' \
  "workspace loop no longer defines batch telemetry shaping inline"
forbid_match_in_file "$DAYTONA_FILE" 'function normalizeRuntimeMountedCommunityAppTools\(' \
  "workspace loop no longer defines mounted tool shaping inline"
forbid_match_in_file "$DAYTONA_FILE" 'internal\.workspaceTerminals\.(startWorkspaceTerminalInternal|readWorkspaceTerminalInternal|writeWorkspaceTerminalInternal|stopWorkspaceTerminalInternal)' \
  "workspace loop no longer calls terminal internals inline"
forbid_match_in_file "$DAYTONA_FILE" 'runDaytonaComputerUseTool\(' \
  "workspace loop no longer runs Daytona computer use inline"

if [[ -e "$ROOT/shared/retrievalAgentDecision.ts" ]]; then
  echo "FAIL: deleted parser file still exists: $ROOT/shared/retrievalAgentDecision.ts"
  exit 1
fi
echo "OK: deleted parser file absent"

require_match_in_file "$TOOL_TYPES_FILE" 'export type RetrievalToolName' \
  "tool name type lives in neutral shared module"
require_match_in_file "$TOOL_TYPES_FILE" '"community_search"' \
  "tool name type includes community_search"
require_match_in_file "$TOOL_TYPES_FILE" '"search_product_docs"' \
  "tool name type includes search_product_docs"
require_match_in_file "$TOOL_TYPES_FILE" '"get_product_doc"' \
  "tool name type includes get_product_doc"
require_match_in_file "$TOOL_TYPES_FILE" '"get_active_community_context"' \
  "tool name type includes get_active_community_context"
require_match_in_file "$TOOL_TYPES_FILE" '"community_write"' \
  "tool name type includes community_write"
require_match_in_file "$TOOL_TYPES_FILE" '"list_dir"' \
  "tool name type includes list_dir"
require_match_in_file "$TOOL_TYPES_FILE" '"web_research"' \
  "tool name type includes web_research"
require_match_in_file "$TOOL_TYPES_FILE" '"read"' \
  "tool name type includes read"
require_match_in_file "$TOOL_TYPES_FILE" '"glob"' \
  "tool name type includes glob"
require_match_in_file "$TOOL_TYPES_FILE" '"grep"' \
  "tool name type includes grep"
require_match_in_file "$TOOL_TYPES_FILE" '"sha256"' \
  "tool name type includes sha256"
require_match_in_file "$TOOL_TYPES_FILE" '"write"' \
  "tool name type includes write"
require_match_in_file "$TOOL_TYPES_FILE" '"edit"' \
  "tool name type includes edit"
require_match_in_file "$TOOL_TYPES_FILE" '"bash"' \
  "tool name type includes bash"
require_match_in_file "$NATIVE_LOOP_FILE" 'kind: "tool_follow_up"' \
  "native tool loop has explicit follow-up state"
require_match_in_file "$NATIVE_LOOP_FILE" 'providerCallId' \
  "native tool loop treats provider call id as first-class"
require_match_in_file "$NATIVE_LOOP_FILE" 'buildToolResultEnvelope' \
  "native tool loop uses a canonical tool result envelope"
require_match_in_file "$RESOLUTION_FILE" '"get_active_community_context"' \
  "runtime capability resolution includes active community context tool"
require_match_in_file "$RESOLUTION_FILE" '"community_search"' \
  "runtime capability resolution includes community search tool"
require_match_in_file "$RESOLUTION_FILE" '"community_write"' \
  "runtime capability resolution includes community tools"
require_match_in_file "$RESOLUTION_FILE" 'toolNames.push\("search_product_docs", "get_product_doc"\)' \
  "runtime capability resolution includes product docs tools"
require_match_in_file "$RESOLUTION_FILE" 'toolNames.push\("web_research"\)' \
  "runtime capability resolution includes web research tools"
require_match_in_file "$RESOLUTION_FILE" 'if \(params.activeCapabilityFamilies.includes\("workspace_tools"\)\)' \
  "runtime capability resolution gates workspace tools structurally"
require_match_in_file "$RESOLUTION_FILE" '"list_dir"' \
  "runtime capability resolution includes list_dir"
require_match_in_file "$RESOLUTION_FILE" '"read"' \
  "runtime capability resolution includes read"
require_match_in_file "$RESOLUTION_FILE" '"glob"' \
  "runtime capability resolution includes glob"
require_match_in_file "$RESOLUTION_FILE" '"grep"' \
  "runtime capability resolution includes grep"
require_match_in_file "$RESOLUTION_FILE" '"sha256"' \
  "runtime capability resolution includes sha256"
require_match_in_file "$RESOLUTION_FILE" '"write"' \
  "runtime capability resolution includes write"
require_match_in_file "$RESOLUTION_FILE" '"edit"' \
  "runtime capability resolution includes edit"
require_match_in_file "$RESOLUTION_FILE" '"bash"' \
  "runtime capability resolution includes bash"

echo "== Runtime tool loop proof =="
node --experimental-strip-types --experimental-specifier-resolution=node "$ROOT/scripts/runtime_tool_loop_proof.ts"
