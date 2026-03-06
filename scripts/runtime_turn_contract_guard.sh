#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Runtime turn contract guard =="

ROUTER_FILE="convex/http.ts"
HTTP_FILE="convex/httpRuntimeRoutes.ts"
THREADS_FILE="convex/threads.ts"

if [[ ! -f "$HTTP_FILE" ]]; then
  echo "FAIL: missing $HTTP_FILE"
  exit 1
fi
if [[ ! -f "$ROUTER_FILE" ]]; then
  echo "FAIL: missing $ROUTER_FILE"
  exit 1
fi
if [[ ! -f "$THREADS_FILE" ]]; then
  echo "FAIL: missing $THREADS_FILE"
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
  if rg -n -S "$pattern" "$file" >/dev/null; then
    echo "FAIL: forbidden pattern detected: $description"
    rg -n -S "$pattern" "$file" || true
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/10] Checking idempotent run_id assignment markers..."
require_match_in_file "$ROUTER_FILE" 'registerRuntimeTurnRoutes\(' \
  "http router registers extracted runtime routes"
RUN_ID_COUNT="$(
  rg -n -S 'const runId = String\(input\.idempotency_key \?\? ""\)\.trim\(\) \|\| `convex_runtime:\$\{crypto\.randomUUID\(\)\}`;' "$HTTP_FILE" \
    | wc -l \
    | tr -d '[:space:]'
)"
if [[ -z "$RUN_ID_COUNT" || "$RUN_ID_COUNT" -lt 2 ]]; then
  echo "FAIL: expected >=2 idempotent runId assignments (public_turn + runtime_turn), found ${RUN_ID_COUNT:-0}"
  exit 1
fi
echo "OK: found $RUN_ID_COUNT idempotent runId assignments."

echo "[2/10] Ensuring no run_id override in public turn path..."
forbid_match_in_file "$HTTP_FILE" 'const runId = `convex_public:\$\{crypto\.randomUUID\(\)\}`' \
  "no public_turn runId override after idempotency assignment"

echo "[3/10] Ensuring runtime turn persists user/assistant messages by deterministic keys..."
require_match_in_file "$HTTP_FILE" 'const explicitUserMessageKey = String\(input\.user_message_key \?\? ""\)\.trim\(\)' \
  "runtime turn accepts explicit user_message_key override"
require_match_in_file "$HTTP_FILE" 'const userMessageKeyForRun = explicitUserMessageKey \|\| `user:\$\{threadKey\}:\$\{runId\}`' \
  "runtime user message key derivation uses explicit override or thread+run idempotency"
require_match_in_file "$HTTP_FILE" 'const assistantMessageKeyForRun = `assistant:\$\{threadKey\}:\$\{runId\}`' \
  "runtime assistant message key derivation uses thread+run idempotency"
require_match_in_file "$HTTP_FILE" 'messageKey: userMessageKeyForRun' \
  "runtime user message persistence uses derived idempotent key"
require_match_in_file "$HTTP_FILE" 'messageKey: assistantMessageKeyForRun' \
  "runtime assistant message persistence uses derived idempotent key"

echo "[4/10] Ensuring runtime turn fail-closed persistence errors exist..."
require_match_in_file "$HTTP_FILE" 'user_message_persist_failed' "runtime user message persistence failure code"
require_match_in_file "$HTTP_FILE" 'assistant_message_persist_failed' "runtime assistant message persistence failure code"

echo "[5/10] Ensuring runtime turn responses include persisted message identifiers..."
require_match_in_file "$HTTP_FILE" 'user_message_id' "runtime response includes user_message_id"
require_match_in_file "$HTTP_FILE" 'assistant_message_id' "runtime response includes assistant_message_id"

echo "[6/10] Ensuring legacy tail-text dedupe suppression logic is absent..."
forbid_match_in_file "$HTTP_FILE" 'listCloudThreadMessages as any' "no runtime tail-read dedupe query before write"
forbid_match_in_file "$HTTP_FILE" 'tailRole === "user"' "no tail-role text dedupe branch"

echo "[7/10] Ensuring runtime turn short-circuits duplicate idempotency keys before inference..."
require_match_in_file "$HTTP_FILE" 'getCloudThreadMessageByOwnerMessageKey as any' \
  "runtime turn checks existing persisted messages by owner+messageKey"
require_match_in_file "$HTTP_FILE" 'const existingAssistant = \(await ctx\.runQuery\(api\.threads\.getCloudThreadMessageByOwnerMessageKey as any' \
  "runtime turn assistant short-circuit lookup exists"
require_match_in_file "$HTTP_FILE" 'if \(existingAssistant\) \{' \
  "runtime turn returns persisted assistant for duplicate idempotency key"
ASSIST_LOOKUP_LINE="$(rg -n -S 'const existingAssistant = \(await ctx\.runQuery\(api\.threads\.getCloudThreadMessageByOwnerMessageKey as any' "$HTTP_FILE" | head -n 1 | cut -d: -f1)"
CHATGPT_COMPLETION_LINE="$(rg -n -S 'runChatgptCompletion\(' "$HTTP_FILE" | tail -n 1 | cut -d: -f1)"
OPENROUTER_COMPLETION_LINE="$(rg -n -S 'runOpenRouterCompletion\(' "$HTTP_FILE" | tail -n 1 | cut -d: -f1)"
DAYTONA_LOOP_LINE="$(rg -n -S 'executeDaytonaAgentLoop\(' "$HTTP_FILE" | tail -n 1 | cut -d: -f1)"
if [[ -z "$ASSIST_LOOKUP_LINE" ]]; then
  echo "FAIL: unable to verify assistant lookup ordering in runtime turn path"
  exit 1
fi
for COMPLETION_LINE in "$CHATGPT_COMPLETION_LINE" "$OPENROUTER_COMPLETION_LINE" "$DAYTONA_LOOP_LINE"; do
  [[ -z "$COMPLETION_LINE" ]] && continue
  if (( ASSIST_LOOKUP_LINE >= COMPLETION_LINE )); then
    echo "FAIL: idempotency assistant lookup must occur before runtime inference/tool call"
    exit 1
  fi
done
echo "OK: assistant short-circuit lookup occurs before runtime inference/tool calls."

echo "[8/10] Ensuring cloud runtime remains single-policy (no manual approval branch state)..."
forbid_match_in_file "$HTTP_FILE" 'tool_decision' \
  "runtime turn contract has no tool_decision action path"
forbid_match_in_file "$HTTP_FILE" 'approval_mode' \
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

echo "[10/10] Guard passed."
echo "PASS: runtime turn contract markers are present and hardened."
