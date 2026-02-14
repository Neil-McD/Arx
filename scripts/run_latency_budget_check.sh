#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TRACE_LOG_PATH="${1:-${THREAD_CONTEXT_TRACE_LOG:-}}"
if [[ -z "$TRACE_LOG_PATH" ]]; then
  echo "FAIL: trace log path required."
  echo "Usage: bash scripts/run_latency_budget_check.sh <trace-log-path>"
  echo "Or set THREAD_CONTEXT_TRACE_LOG=/path/to/log"
  exit 1
fi

if [[ ! -f "$TRACE_LOG_PATH" ]]; then
  echo "FAIL: trace log file not found: $TRACE_LOG_PATH"
  exit 1
fi

MIN_OK="${RUN_LATENCY_MIN_OK:-20}"
MAX_P95_PREFLIGHT_MS="${RUN_LATENCY_MAX_P95_PREFLIGHT_MS:-600}"
MAX_P95_FIRST_TEXT_TOKEN_MS="${RUN_LATENCY_MAX_P95_FIRST_TEXT_TOKEN_MS:-1800}"
MAX_P95_TURN_TOTAL_MS="${RUN_LATENCY_MAX_P95_TURN_TOTAL_MS:-}"

echo "== Run latency budget checks =="
echo "log: $TRACE_LOG_PATH"
echo "min_ok: $MIN_OK"
echo "max_p95_preflight_ms: $MAX_P95_PREFLIGHT_MS"
echo "max_p95_first_text_token_ms: $MAX_P95_FIRST_TEXT_TOKEN_MS"
if [[ -n "$MAX_P95_TURN_TOTAL_MS" ]]; then
  echo "max_p95_turn_total_ms: $MAX_P95_TURN_TOTAL_MS"
fi

args=(
  "scripts/run_latency_report.mjs"
  "$TRACE_LOG_PATH"
  "--min-ok=${MIN_OK}"
  "--max-p95-preflight-ms=${MAX_P95_PREFLIGHT_MS}"
  "--max-p95-first-text-token-ms=${MAX_P95_FIRST_TEXT_TOKEN_MS}"
)

if [[ -n "$MAX_P95_TURN_TOTAL_MS" ]]; then
  args+=("--max-p95-turn-total-ms=${MAX_P95_TURN_TOTAL_MS}")
fi

node "${args[@]}"

echo "PASS: run latency budget checks passed."
