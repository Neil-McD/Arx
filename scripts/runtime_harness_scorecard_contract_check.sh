#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THREADS_FILE="$ROOT/convex/threads.ts"

echo "== Runtime harness scorecard contract guard =="

SCORECARD_BLOCK="$(awk '
  /export const getCloudRuntimeHarnessScorecard = query\(\{/ { in_block=1 }
  in_block { print }
  /export const backfillCloudRuntimeHarnessTelemetrySummaries = mutation\(\{/ { exit }
' "$THREADS_FILE")"

require_in_block() {
  local pattern="$1"
  local description="$2"
  if ! grep -Eq "$pattern" <<<"$SCORECARD_BLOCK"; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

forbid_in_block() {
  local pattern="$1"
  local description="$2"
  if grep -Eq "$pattern" <<<"$SCORECARD_BLOCK"; then
    echo "FAIL: forbidden pattern detected: $description"
    grep -En "$pattern" <<<"$SCORECARD_BLOCK" || true
    exit 1
  fi
  echo "OK: $description"
}

require_in_block 'runtimeHarnessTelemetrySummary' \
  "scorecard reads materialized run telemetry summaries"
require_in_block 'listRecentRuntimeRunsForScorecard' \
  "scorecard uses paged recent-run selection helper"
forbid_in_block 'runtimeRunEvents' \
  "scorecard does not replay runtime run events"
forbid_in_block 'by_owner_run_seq' \
  "scorecard does not query runtime event history directly"

echo "Runtime harness scorecard contract guard passed."
