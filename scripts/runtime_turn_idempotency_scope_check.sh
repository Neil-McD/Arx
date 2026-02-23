#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME_TURN="supabase/functions/runtime_turn/index.ts"
MIGRATION="supabase/migrations/20260223220000_runtime_runs_idempotency_thread_scope.sql"

echo "== Runtime turn idempotency scope check =="

echo "[1/4] Thread-scoped idempotency migration must exist..."
test -f "$MIGRATION" || {
  echo "FAIL: missing migration $MIGRATION"
  exit 1
}

echo "[2/4] Migration must enforce unique(user_id, thread_id, idempotency_key)..."
grep -q 'unique (user_id, thread_id, idempotency_key)' "$MIGRATION" || {
  echo "FAIL: migration missing thread-scoped idempotency unique constraint"
  exit 1
}

echo "[3/4] runtime_turn dedupe lookup must include thread_id filter..."
grep -q 'thread_id=eq' "$RUNTIME_TURN" || {
  echo "FAIL: runtime_turn dedupe lookup missing thread_id filter"
  exit 1
}

echo "[4/4] runtime_turn must call findExistingRun(userId, threadId, idempotencyKey)..."
grep -q 'findExistingRun(userId, threadId, idempotencyKey)' "$RUNTIME_TURN" || {
  echo "FAIL: runtime_turn existing-run lookup call missing thread scope"
  exit 1
}

echo "PASS: runtime turn idempotency scope check passed."
