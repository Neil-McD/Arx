#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TAURI_DB="src-tauri/src/db.rs"
TAURI_MAIN="src-tauri/src/main.rs"
WEB_TURN_RUNNER="shared/useWebTurnRunnerController.ts"

echo "== Reliability smoke gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

TOTAL_STEPS=6
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

require_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  rg -F -q "$pattern" "$file" || {
    echo "FAIL: $message"
    exit 1
  }
}

check_crash_recovery_invariants() {
  require_contains "$TAURI_DB" "pub fn crash_recovery(" "db missing crash_recovery entrypoint"
  require_contains "$TAURI_DB" "\"status\": \"error\"" "db crash recovery must close unfinished runs as error"
  require_contains "$TAURI_DB" "\"status\": \"unknown\"" "db crash recovery must close unfinished tools as unknown"
  require_contains "$TAURI_DB" "\"reason\": \"crash_recovery\"" "db crash recovery reason marker missing"
  require_contains "$TAURI_DB" "run_finished payload_json must include non-empty status" "run_finished status contract missing"
}

check_cancellation_invariants() {
  require_contains "$TAURI_MAIN" "fn finish_cancelled_messages_agent(" "desktop runtime missing cancelled-run finisher"
  require_contains "$TAURI_MAIN" "append_run_finished(" "desktop runtime missing run_finished append path"
  require_contains "$TAURI_MAIN" "Some(\"user_cancel\")" "desktop runtime missing user_cancel reason on cancellation"
  require_contains "$WEB_TURN_RUNNER" "if (cancelled) {" "web turn runner missing cancelled branch"
  require_contains "$WEB_TURN_RUNNER" "return { cancelled: true, error: null };" "web turn runner missing cancelled return contract"
}

check_event_immutability_invariants() {
  require_contains "$TAURI_DB" "CREATE TRIGGER events_bu_immutable BEFORE UPDATE ON events" "db missing events update immutability trigger"
  require_contains "$TAURI_DB" "CREATE TRIGGER events_bd_immutable BEFORE DELETE ON events" "db missing events delete immutability trigger"
  require_contains "$TAURI_DB" "events_are_immutable_for_direct_update_and_delete" "db immutability regression test missing"
}

run_step "Desktop app build smoke" npm run build
run_step "Web app build smoke" npm --prefix apps/web run build
run_step "Canonical turn-path smoke tests" bash scripts/reliability_turn_path_smoke_check.sh
run_step "Crash-recovery closure invariants" check_crash_recovery_invariants
run_step "Cancellation closure invariants" check_cancellation_invariants
run_step "Event immutability invariants" check_event_immutability_invariants

echo "PASS: reliability smoke gate passed."
