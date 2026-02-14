#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Thread/event perf smoke checks =="

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "FAIL: sqlite3 is required for thread/event perf smoke checks."
  exit 1
fi

THREAD_COUNT="${THREAD_EVENT_PERF_THREADS:-16}"
EVENTS_PER_THREAD="${THREAD_EVENT_PERF_EVENTS_PER_THREAD:-4000}"
EVENT_TAIL_BUDGET_MS="${THREAD_EVENT_PERF_TAIL_BUDGET_MS:-140}"
MESSAGE_TAIL_BUDGET_MS="${THREAD_EVENT_PERF_MESSAGE_BUDGET_MS:-120}"
EVENT_COUNT_BUDGET_MS="${THREAD_EVENT_PERF_COUNT_BUDGET_MS:-80}"

TMP_DIR="$(mktemp -d)"
DB_PATH="${TMP_DIR}/thread_event_perf_smoke.sqlite3"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Seeding synthetic dataset: threads=${THREAD_COUNT} events_per_thread=${EVENTS_PER_THREAD}"

sqlite3 "$DB_PATH" <<SQL
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = 100000;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  text TEXT,
  payload_json TEXT,
  blob_ref TEXT
);
CREATE INDEX idx_events_thread_seq ON events(thread_id, seq);
CREATE INDEX idx_events_thread_type ON events(thread_id, type);

CREATE TABLE messages_projection (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  engine_id TEXT,
  model_id TEXT,
  run_id TEXT,
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL
);
CREATE INDEX idx_messages_projection_thread_seq ON messages_projection(thread_id, seq);

WITH RECURSIVE
  thread_ids(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM thread_ids WHERE n < ${THREAD_COUNT}
  ),
  seq_ids(s) AS (
    SELECT 1
    UNION ALL
    SELECT s + 1 FROM seq_ids WHERE s < ${EVENTS_PER_THREAD}
  )
INSERT INTO events (id, thread_id, seq, type, created_at, text, payload_json, blob_ref)
SELECT
  printf('ev_%04d_%06d', thread_ids.n, seq_ids.s),
  printf('thread_%04d', thread_ids.n),
  seq_ids.s,
  CASE WHEN seq_ids.s % 9 = 0 THEN 'assistant_message' ELSE 'engine_io_chunk' END,
  1700000000 + seq_ids.s,
  CASE WHEN seq_ids.s % 9 = 0 THEN printf('message_%d', seq_ids.s) ELSE NULL END,
  '{"v":1}',
  NULL
FROM thread_ids
CROSS JOIN seq_ids;

INSERT INTO messages_projection (id, thread_id, role, content_json, engine_id, model_id, run_id, created_at, seq)
SELECT
  'msg_' || id,
  thread_id,
  'assistant',
  '{"text":"ok"}',
  NULL,
  NULL,
  NULL,
  created_at,
  seq
FROM events
WHERE type = 'assistant_message';
SQL

TARGET_THREAD="$(printf 'thread_%04d' 7)"

require_index_plan() {
  local label="$1"
  local query="$2"
  local required_fragment="$3"
  local plan
  plan="$(sqlite3 "$DB_PATH" "EXPLAIN QUERY PLAN ${query}")"
  if ! printf '%s\n' "$plan" | rg -q "$required_fragment"; then
    echo "FAIL: ${label} is not using expected index pattern (${required_fragment})."
    echo "$plan"
    exit 1
  fi
}

measure_query_ms() {
  local label="$1"
  local query="$2"
  local budget_ms="$3"
  local timing
  timing="$(
    {
      /usr/bin/time -p sqlite3 "$DB_PATH" "$query" >/dev/null
    } 2>&1
  )"
  local real_seconds
  real_seconds="$(printf '%s\n' "$timing" | awk '/^real / { print $2; exit }')"
  if [[ -z "$real_seconds" ]]; then
    echo "FAIL: unable to measure timing for ${label}"
    echo "$timing"
    exit 1
  fi
  local elapsed_ms
  elapsed_ms="$(awk -v seconds="$real_seconds" 'BEGIN { printf "%.0f", seconds * 1000 }')"
  echo "Checking ${label}: ${elapsed_ms}ms <= ${budget_ms}ms"
  if (( elapsed_ms > budget_ms )); then
    echo "FAIL: ${label} exceeded budget (${elapsed_ms}ms > ${budget_ms}ms)"
    exit 1
  fi
}

require_index_plan \
  "event tail query plan" \
  "SELECT id, seq FROM events WHERE thread_id = '${TARGET_THREAD}' ORDER BY seq DESC LIMIT 200;" \
  "idx_events_thread_seq"

require_index_plan \
  "messages tail query plan" \
  "SELECT id, seq FROM messages_projection WHERE thread_id = '${TARGET_THREAD}' ORDER BY seq DESC LIMIT 100;" \
  "idx_messages_projection_thread_seq"

measure_query_ms \
  "event tail query" \
  "SELECT id, seq FROM events WHERE thread_id = '${TARGET_THREAD}' ORDER BY seq DESC LIMIT 200;" \
  "$EVENT_TAIL_BUDGET_MS"

measure_query_ms \
  "messages tail query" \
  "SELECT id, seq FROM messages_projection WHERE thread_id = '${TARGET_THREAD}' ORDER BY seq DESC LIMIT 100;" \
  "$MESSAGE_TAIL_BUDGET_MS"

measure_query_ms \
  "thread assistant count query" \
  "SELECT COUNT(*) FROM events WHERE thread_id = '${TARGET_THREAD}' AND type = 'assistant_message';" \
  "$EVENT_COUNT_BUDGET_MS"

echo "PASS: thread/event perf smoke checks passed."
