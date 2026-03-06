#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Runtime turn client idempotency guard =="

WEB_FILE="shared/useWebSendFlowController.ts"
WEB_RUNNER_FILE="shared/useWebTurnRunnerController.ts"
DESKTOP_FILE="src/services/thread/createDesktopCloudChatThreadApi.ts"

for required in "$WEB_FILE" "$WEB_RUNNER_FILE" "$DESKTOP_FILE"; do
  if [[ ! -f "$required" ]]; then
    echo "FAIL: missing $required"
    exit 1
  fi
done

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

echo "[1/7] Web agent send path must use deterministic idempotency key from user message id..."
require_match_in_file "$WEB_FILE" 'runIdHint: `agent_web:\$\{messageId\}`' \
  "web agent send runIdHint uses messageId only"

echo "[2/7] Web agent retry path must reuse deterministic key (no timestamp entropy)..."
require_match_in_file "$WEB_FILE" 'runIdHint: `agent_web:\$\{lastUserMessageId\}`' \
  "web agent retry runIdHint reuses last user message id"

echo "[3/7] Web regenerate path must use a fresh key to request a new assistant output..."
require_match_in_file "$WEB_FILE" 'runIdHint: `agent_web_regen:\$\{lastUserMessageId\}:\$\{Date\.now\(\)\}`' \
  "web agent regenerate runIdHint includes timestamp entropy"

echo "[4/7] Web runtime transport must pass runIdHint through as runtime idempotency key..."
require_match_in_file "$WEB_RUNNER_FILE" 'idempotency_key: params\.runIdHint' \
  "web runtime runner forwards runIdHint as idempotency_key"

echo "[5/7] Desktop runtime path must key idempotency by reply target..."
require_match_in_file "$DESKTOP_FILE" 'idempotency_key: `desktop_runtime:\$\{replyToId\}`' \
  "desktop runtime idempotency key uses replyToId"

echo "[6/7] Runtime consumers must fail closed when assistant persistence metadata is missing..."
require_match_in_file "$WEB_RUNNER_FILE" 'Runtime turn did not persist assistant message\.' \
  "web runtime consumer requires persisted assistant message id"
require_match_in_file "$DESKTOP_FILE" 'Runtime turn did not persist assistant message\.' \
  "desktop runtime consumer requires persisted assistant message id"

echo "[7/7] Guard passed."
echo "PASS: runtime turn client idempotency contracts are enforced."
