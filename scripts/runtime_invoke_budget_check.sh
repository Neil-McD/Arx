#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_PATH="${1:-${RUNTIME_INVOKE_LOG_PATH:-}}"
if [[ -z "$LOG_PATH" ]]; then
  echo "FAIL: runtime invoke log path required."
  echo "Usage: bash scripts/runtime_invoke_budget_check.sh <log-path>"
  echo "Or set RUNTIME_INVOKE_LOG_PATH=/path/to/log"
  exit 1
fi

if [[ ! -f "$LOG_PATH" ]]; then
  echo "FAIL: log file not found: $LOG_PATH"
  exit 1
fi

MAX_TOOL_CALLS_PER_WINDOW="${RUNTIME_INVOKE_MAX_LIST_TOOL_CALLS_PER_WINDOW:-200}"
MAX_EVENTS_SINCE_PER_WINDOW="${RUNTIME_INVOKE_MAX_LIST_EVENTS_SINCE_PER_WINDOW:-250}"

echo "== Runtime invoke budget checks =="
echo "log: $LOG_PATH"
echo "max_list_tool_calls_per_window: $MAX_TOOL_CALLS_PER_WINDOW"
echo "max_list_events_since_per_window: $MAX_EVENTS_SINCE_PER_WINDOW"

node scripts/runtime_thread_invoke_report.mjs \
  "$LOG_PATH" \
  "--max-list-tool-calls-per-window=${MAX_TOOL_CALLS_PER_WINDOW}" \
  "--max-list-events-since-per-window=${MAX_EVENTS_SINCE_PER_WINDOW}"

echo "PASS: runtime invoke budget checks passed."
