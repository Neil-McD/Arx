#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

ENV_FILES=(
  ".env.local"
  ".env"
)

DEFAULT_OLDER_THAN_DAYS=14
DEFAULT_LIMIT=100
DEFAULT_MAX_BATCHES=200

usage() {
  cat <<'EOF'
Usage: bash scripts/auth_prune_sessions.sh [--older-than-days <days>] [--limit <count>] [--max-batches <count>] [--execute] [--help]

Audits revoked auth session rows older than the chosen retention window in the
production Convex deployment. Pass --execute to delete bounded batches until the
eligible set is empty or the maximum batch guard is reached.

Defaults:
  --older-than-days 14
  --limit 100
  --max-batches 200
  audit only; no rows are deleted without --execute
EOF
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_wrapping_quotes() {
  local value="$1"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

lookup_key() {
  local key="$1"
  local direct="${!key-}"
  if [[ -n "$direct" ]]; then
    trim "$direct"
    return 0
  fi

  local file line
  for file in "${ENV_FILES[@]}"; do
    [[ -f "$file" ]] || continue
    line="$(rg -n --no-heading -m1 "^${key}=.*$" "$file" 2>/dev/null | cut -d: -f2- || true)"
    if [[ -n "$line" ]]; then
      local value="${line#*=}"
      value="$(strip_wrapping_quotes "$value")"
      trim "$value"
      return 0
    fi
  done

  printf ''
}

OLDER_THAN_DAYS="$DEFAULT_OLDER_THAN_DAYS"
LIMIT="$DEFAULT_LIMIT"
MAX_BATCHES="$DEFAULT_MAX_BATCHES"
EXECUTE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --older-than-days)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --older-than-days requires a value" >&2
        exit 1
      }
      OLDER_THAN_DAYS="$2"
      shift 2
      ;;
    --limit)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --limit requires a value" >&2
        exit 1
      }
      LIMIT="$2"
      shift 2
      ;;
    --max-batches)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --max-batches requires a value" >&2
        exit 1
      }
      MAX_BATCHES="$2"
      shift 2
      ;;
    --execute)
      EXECUTE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "FAIL: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "$OLDER_THAN_DAYS" =~ ^[0-9]+$ ]] || [[ "$OLDER_THAN_DAYS" -le 0 ]]; then
  echo "FAIL: --older-than-days must be a positive integer" >&2
  exit 1
fi

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -le 0 ]]; then
  echo "FAIL: --limit must be a positive integer" >&2
  exit 1
fi

if [[ "$LIMIT" -gt 100 ]]; then
  echo "FAIL: --limit cannot exceed the server maximum of 100" >&2
  exit 1
fi

if ! [[ "$MAX_BATCHES" =~ ^[0-9]+$ ]] || [[ "$MAX_BATCHES" -le 0 ]]; then
  echo "FAIL: --max-batches must be a positive integer" >&2
  exit 1
fi

SECRET="$(lookup_key "ARX_AUTH_MIGRATION_AUDIT_SECRET")"
if [[ -z "$SECRET" ]]; then
  echo "FAIL: missing ARX_AUTH_MIGRATION_AUDIT_SECRET in env or repo-root .env/.env.local" >&2
  exit 1
fi

CUTOFF_MS="$(node -e 'const days = Number(process.argv[1]); process.stdout.write(String(Date.now() - days * 24 * 60 * 60 * 1000));' "$OLDER_THAN_DAYS")"
echo "== Auth session prune =="
echo "Scope: production Convex deployment"
echo "Retention: keep revoked rows newer than ${OLDER_THAN_DAYS} day(s)"
echo "Batch limit: ${LIMIT}"
echo "Cutoff ms: ${CUTOFF_MS}"
echo "Mode: $([[ "$EXECUTE" == true ]] && echo execute || echo audit-only)"

run_batch() {
  local dry_run="$1"
  local args_json
  args_json="$(node -e 'const [secret, revokedBeforeMs, limit, dryRun] = process.argv.slice(1); process.stdout.write(JSON.stringify({ secret, revokedBeforeMs: Number(revokedBeforeMs), limit: Number(limit), dryRun: dryRun === "true" }));' "$SECRET" "$CUTOFF_MS" "$LIMIT" "$dry_run")"
  npx convex run --prod --typecheck disable --codegen disable \
    authSessions:pruneRevokedAuthSessionsForMaintenance \
    "$args_json"
}

if [[ "$EXECUTE" != true ]]; then
  run_batch true
  exit 0
fi

TOTAL_DELETED=0
for ((batch = 1; batch <= MAX_BATCHES; batch += 1)); do
  RESULT="$(run_batch false)"
  IFS=$'\t' read -r DELETED HAS_MORE DONE DRY_RUN ELIGIBLE SCANNED < <(
    RESULT_JSON="$RESULT" node -e '
      const result = JSON.parse(process.env.RESULT_JSON || "{}");
      const required = ["deleted", "has_more", "done", "dry_run", "eligible", "scanned"];
      for (const key of required) {
        if (!(key in result)) throw new Error(`auth_prune_result_missing_${key}`);
      }
      process.stdout.write(required.map((key) => String(result[key])).join("\t"));
    '
  )
  if [[ "$DRY_RUN" != false ]]; then
    echo "FAIL: execute mode received a dry-run result" >&2
    exit 1
  fi
  if ! [[ "$DELETED" =~ ^[0-9]+$ ]]; then
    echo "FAIL: invalid deleted count" >&2
    exit 1
  fi
  TOTAL_DELETED=$((TOTAL_DELETED + DELETED))
  echo "Batch ${batch}: scanned=${SCANNED} eligible=${ELIGIBLE} deleted=${DELETED} has_more=${HAS_MORE}"
  if [[ "$DONE" == true && "$HAS_MORE" == false ]]; then
    echo "Complete: deleted ${TOTAL_DELETED} revoked session row(s)."
    exit 0
  fi
  if [[ "$HAS_MORE" != true || "$DELETED" -eq 0 ]]; then
    echo "FAIL: prune made no truthful forward progress" >&2
    exit 1
  fi
done

echo "FAIL: reached --max-batches ${MAX_BATCHES} with eligible rows remaining" >&2
exit 1
