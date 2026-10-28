#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== Runtime turn contract guard =="

ROUTER_FILE="convex/http.ts"
HTTP_FILE="convex/httpRuntimeRoutes.ts"
HANDLERS_FILE="convex/runtimeTurnHandlers.ts"
RESOLUTION_FILE="convex/runtimeTurnResolution.ts"
PERSISTENCE_FILE="convex/runtimeTurnPersistence.ts"
THREADS_FILE="convex/threads.ts"
LOOP_FILE="convex/runtimeAgentLoop.ts"
COMMUNITY_AGENT_DOCK_FILE="apps/web/src/components/WebCommunityAgentDock.tsx"
TURN_RUNNER_FILE="shared/useWebTurnRunnerController.ts"
SCHEMA_FILE="convex/schema.ts"

if [[ ! -f "$HTTP_FILE" ]]; then
  echo "FAIL: missing $HTTP_FILE"
  exit 1
fi
if [[ ! -f "$ROUTER_FILE" ]]; then
  echo "FAIL: missing $ROUTER_FILE"
  exit 1
fi
if [[ ! -f "$HANDLERS_FILE" ]]; then
  echo "FAIL: missing $HANDLERS_FILE"
  exit 1
fi
if [[ ! -f "$RESOLUTION_FILE" ]]; then
  echo "FAIL: missing $RESOLUTION_FILE"
  exit 1
fi
if [[ ! -f "$PERSISTENCE_FILE" ]]; then
  echo "FAIL: missing $PERSISTENCE_FILE"
  exit 1
fi
if [[ ! -f "$THREADS_FILE" ]]; then
  echo "FAIL: missing $THREADS_FILE"
  exit 1
fi
if [[ ! -f "$LOOP_FILE" ]]; then
  echo "FAIL: missing $LOOP_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_AGENT_DOCK_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_AGENT_DOCK_FILE"
  exit 1
fi
if [[ ! -f "$TURN_RUNNER_FILE" ]]; then
  echo "FAIL: missing $TURN_RUNNER_FILE"
  exit 1
fi
if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "FAIL: missing $SCHEMA_FILE"
  exit 1
fi
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
  guard_rg_assert_absent \
    "forbidden pattern: $description" \
    -n -S "$pattern" "$file"
  echo "OK: $description"
}

echo "[1/10] Checking idempotent run_id assignment markers..."
require_match_in_file "$ROUTER_FILE" 'registerRuntimeTurnRoutes\(' \
  "http router registers extracted runtime routes"
RUN_ID_COUNT="$(
  rg -n -S 'convex_runtime:\$\{crypto\.randomUUID\(\)\}`' "$HANDLERS_FILE" \
    | wc -l \
    | tr -d '[:space:]'
)"
if [[ "$RUN_ID_COUNT" != "1" ]]; then
  echo "FAIL: expected exactly one native runtime_turn runId assignment, found ${RUN_ID_COUNT:-0}"
  exit 1
fi
echo "OK: found the one canonical runtime_turn runId assignment."

echo "[2/10] Ensuring the retired public turn ingress is absent..."
forbid_match_in_file "$HTTP_FILE" 'public_turn' "runtime route registry excludes public_turn"
forbid_match_in_file "$HANDLERS_FILE" 'handlePublicTurnRequest' "runtime handlers exclude public turn execution"
forbid_match_in_file "$TURN_RUNNER_FILE" 'runPublicTurn|invokeCloudPublicTurn' "browser runner excludes public turns"

echo "[3/10] Ensuring runtime turn persists user/assistant messages by deterministic keys..."
require_match_in_file "$HANDLERS_FILE" 'const explicitUserMessageKey = String\(input\.user_message_key \?\? ""\)\.trim\(\)' \
  "runtime turn accepts explicit user_message_key override from canonical input"
require_match_in_file "$HANDLERS_FILE" 'const userMessageKeyForRun =' \
  "runtime user message key derivation exists"
require_match_in_file "$HANDLERS_FILE" '`user:\$\{threadKey\}:\$\{runId\}`' \
  "runtime user message key derivation uses thread+run idempotency"
require_match_in_file "$HANDLERS_FILE" 'const assistantMessageKeyForRun = `assistant:\$\{threadKey\}:\$\{runId\}`' \
  "runtime assistant message key derivation uses thread+run idempotency"
require_match_in_file "$PERSISTENCE_FILE" 'messageKey: args\.messageKey' \
  "runtime user message persistence uses derived idempotent key"
require_match_in_file "$PERSISTENCE_FILE" 'messageKey: args\.messageKey' \
  "runtime assistant message persistence uses derived idempotent key"

echo "[4/10] Ensuring runtime turn fail-closed persistence errors exist..."
require_match_in_file "$HANDLERS_FILE" 'user_message_persist_failed' "runtime user message persistence failure code"
require_match_in_file "$HANDLERS_FILE" 'assistant_message_persist_failed' "runtime assistant message persistence failure code"

echo "[5/10] Ensuring runtime turn responses include persisted message identifiers..."
require_match_in_file "$HANDLERS_FILE" 'userMessageId' "runtime response includes userMessageId"
require_match_in_file "$HANDLERS_FILE" 'assistantMessageId' "runtime response includes assistantMessageId"

echo "[6/10] Ensuring legacy tail-text dedupe suppression logic is absent..."
forbid_match_in_file "$HANDLERS_FILE" 'listCloudThreadMessages as any' "no runtime tail-read dedupe query before write"
forbid_match_in_file "$HANDLERS_FILE" 'tailRole === "user"' "no tail-role text dedupe branch"

echo "[7/10] Ensuring runtime turn short-circuits duplicate idempotency keys before inference..."
require_match_in_file "$PERSISTENCE_FILE" 'getCloudThreadMessageByOwnerMessageKey as any' \
  "runtime turn checks existing persisted messages by owner+messageKey"
require_match_in_file "$PERSISTENCE_FILE" 'existingAssistant = \(await ctx\.runQuery\(' \
  "runtime turn assistant short-circuit lookup exists"
require_match_in_file "$HANDLERS_FILE" 'if \(existingReplay\) \{' \
  "runtime turn returns persisted assistant for duplicate idempotency key"
ASSIST_LOOKUP_LINE="$(rg -n -S 'existingAssistant = \(await ctx\.runQuery\(' "$PERSISTENCE_FILE" | head -n 1 | cut -d: -f1)"
OPENAI_COMPLETION_LINE="$(rg -n -S 'runOpenAiCompletion\(' "$HANDLERS_FILE" | tail -n 1 | cut -d: -f1)"
UNIFIED_TOOL_LOOP_LINE="$(rg -n -S 'executeChatToolsAgentLoop\(' "$HANDLERS_FILE" | tail -n 1 | cut -d: -f1)"
if [[ -z "$ASSIST_LOOKUP_LINE" ]]; then
  echo "FAIL: unable to verify assistant lookup ordering in runtime turn path"
  exit 1
fi
for COMPLETION_LINE in "$OPENAI_COMPLETION_LINE" "$UNIFIED_TOOL_LOOP_LINE"; do
  [[ -z "$COMPLETION_LINE" ]] && continue
  if (( ASSIST_LOOKUP_LINE >= COMPLETION_LINE )); then
    echo "FAIL: idempotency assistant lookup must occur before runtime inference/tool call"
    exit 1
  fi
done
echo "OK: assistant short-circuit lookup occurs before runtime inference/tool calls."

echo "[8/10] Ensuring cloud runtime remains single-policy (no manual approval branch state)..."
forbid_match_in_file "$HANDLERS_FILE" 'tool_decision' \
  "runtime turn contract has no tool_decision action path"
forbid_match_in_file "$HANDLERS_FILE" 'approval_mode' \
  "runtime turn contract has no approval_mode branch state"
forbid_match_in_file "$THREADS_FILE" 'runtimeToolDecisions' \
  "threads contract has no runtimeToolDecisions persistence surface"
forbid_match_in_file "$THREADS_FILE" 'getCloudRuntimeToolDecision' \
  "threads contract has no cloud tool decision query"
forbid_match_in_file "$THREADS_FILE" 'upsertCloudRuntimeToolDecision' \
  "threads contract has no cloud tool decision mutation"

echo "[9/10] Ensuring thread-message mutation preserves message-key idempotency..."
require_match_in_file "$THREADS_FILE" 'export const getCloudThreadMessageByOwnerMessageKey = query\(' \
  "threads query exposes owner+messageKey lookup for runtime idempotency"
require_match_in_file "$THREADS_FILE" 'withIndex\("by_owner_messageKey", \(q\) => q\.eq\("ownerId", (args\.ownerId|ownerId)\)\.eq\("messageKey", explicitMessageKey\)\)' \
  "threads mutation checks existing owner+messageKey rows"
require_match_in_file "$THREADS_FILE" 'throw new Error\("message_key_conflict"\)' \
  "threads mutation rejects cross-thread messageKey collisions"
require_match_in_file "$THREADS_FILE" 'return existingByMessageKey;' \
  "threads mutation returns existing row for duplicate messageKey"

echo "[11/11] Ensuring browser tool routing is structural, not heuristic..."
require_match_in_file "$COMMUNITY_AGENT_DOCK_FILE" 'requestedAgenticTools: true' \
  "mounted member-agent turns stay tool-capable by default"
forbid_match_in_file "$COMMUNITY_AGENT_DOCK_FILE" 'requiresWorkspaceTools' \
  "member-agent dock does not carry a workspace-mode flag"
forbid_match_in_file "$TURN_RUNNER_FILE" 'resolveAuthenticatedTurnToolMode' \
  "turn runner does not use heuristic tool mode classification"
forbid_match_in_file "$TURN_RUNNER_FILE" 'TRIVIAL_CHAT_MESSAGE_RE|CHAT_TOOLS_ACTION_RE|WORKSPACE_ACTION_RE' \
  "turn runner does not use regex intent heuristics"
forbid_match_in_file "$TURN_RUNNER_FILE" 'return argsRef\.current\.hasPaidAccess \? "workspace_compute" : "chat";' \
  "turn runner does not route paid turns to workspace by default"
forbid_match_in_file "$HANDLERS_FILE" 'executeWorkspaceAgentLoop\(' \
  "runtime no longer uses a separate eager workspace executor"
forbid_match_in_file "$SCHEMA_FILE" 'requestedExecutionTarget' \
  "runtimeRuns schema no longer carries requestedExecutionTarget compatibility residue"
forbid_match_in_file "$SCHEMA_FILE" 'requiresWorkspaceTools' \
  "runtimeRuns schema no longer carries requiresWorkspaceTools compatibility residue"
for field in sandboxMode workspaceSessionState workspaceProviderSandboxId workspaceToolboxProxyUrl workspaceSessionRegion workspaceSessionUpdatedAt; do
  forbid_match_in_file "$SCHEMA_FILE" "$field:" \
    "schema no longer carries retired $field compatibility residue"
done
forbid_match_in_file "$SCHEMA_FILE" '\bruntimeEngine\b|\bruntime_engine\b' \
  "thread schema no longer carries the constant native runtime marker"
forbid_match_in_file "$THREADS_FILE" '\bruntimeEngine\b|\bruntime_engine\b' \
  "thread APIs no longer accept, return, or write the constant native runtime marker"
if [[ -e "convex/threadRuntimeMarkerRetirement.ts" ]]; then
  echo "FAIL: temporary threadRuntimeMarkerRetirement.ts must be deleted after Release B"
  exit 1
fi
echo "OK: temporary threadRuntimeMarkerRetirement.ts is deleted"
for file in \
  shared/cloudThreadsRead.ts \
  shared/cloudThreadsGateway.ts \
  shared/cloudCommunityAgentConversationGateway.ts \
  shared/webTurnRunnerCore.ts \
  shared/useWebTurnRunnerController.ts \
  apps/web/src/components/WebCommunityAgentDock.tsx; do
  forbid_match_in_file "$file" '\bruntimeEngine\b|\bruntime_engine\b' \
    "$file no longer transports the constant native runtime marker"
done
forbid_match_in_file "$SCHEMA_FILE" 'v\.literal\("codex"\)' \
  "schema contains no Codex runtime variant"
if [[ -e "convex/projectResidueRetirement.ts" ]]; then
  echo "FAIL: temporary projectResidueRetirement.ts must be deleted after Release B"
  exit 1
fi
echo "OK: temporary projectResidueRetirement.ts is deleted"
forbid_match_in_file "$THREADS_FILE" 'setCloudRuntimeRunWorkspaceSessionInternal|workspaceSessionState: "none"|run\.workspaceProviderSandboxId|run\.workspaceToolboxProxyUrl' \
  "threads no longer expose or initialize an active Workspace session"
forbid_match_in_file "$LOOP_FILE" 'runtimeExecutionSession|workspaceRuntime|workspaceTerminals|daytonaCodexRuntime|executeTerminalTool|executeComputerTool' \
  "canonical agent loop cannot reach the retired Workspace runtime"
if [[ -e "convex/runtimeExecutionSession.ts" ]]; then
  echo "FAIL: retired runtimeExecutionSession.ts must remain deleted"
  exit 1
fi
echo "OK: retired runtimeExecutionSession.ts remains deleted"

echo "PASS: runtime turn contract markers are present and hardened."
