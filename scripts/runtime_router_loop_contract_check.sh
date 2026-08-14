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
require "$RESOLUTION" 'function resolveAllowedToolNames\(' "runtime derives allowed tools directly"
require "$HANDLERS" 'executeChatToolsAgentLoop\(' "one governed agent loop handles native turns"
require "$HANDLERS" 'executionMode: "agentic"' "runtime persists one canonical execution mode"
require "$LOOP" 'runNativeRuntimeKernel<' "runtime uses the explicit kernel state machine"
require "$LOOP" 'runProviderNativeToolCompletion\(' "runtime uses provider-native tool completion"
require "$PROMPT" 'Use native tool calls\. Do not describe tool calls in JSON or markdown\.' "prompt requires native tool calls"
forbid "$HANDLERS" 'runtimeExecutionMode|capability_composed_chat_v1|legacy_project_workspace' "legacy runtime branches stay deleted"
forbid "$LOOP" 'runtimeExecutionSession|workspaceRuntime|workspaceTerminals|daytonaCodexRuntime|executeTerminalTool|executeComputerTool' "agent loop cannot reach Workspace execution"
forbid "$PROMPT" 'workspace_harness_context|PLATFORM_HARNESS_CONTEXT|terminal_start|computer_screenshot' "prompt cannot advertise Workspace capabilities"
forbid "$TOOLS" '"list_dir"|"bash"|"terminal_start"|"computer_screenshot"' "retired Workspace tools stay outside the model tool type"
for tool in search_product_docs get_product_doc polynet_list polynet_read polynet_search polynet_write polynet_call web_research web_crawl; do
  require "$TOOLS" "\"$tool\"" "active tool type includes $tool"
done

node --experimental-strip-types --experimental-specifier-resolution=node "$ROOT/scripts/runtime_tool_loop_proof.ts"
echo "runtime_router_loop_contract_check: ok"
