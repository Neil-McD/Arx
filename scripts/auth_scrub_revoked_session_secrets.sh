#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILES=(
  ".env.local"
  ".env"
)

DEFAULT_LIMIT=100
DEFAULT_MAX_BATCHES=200

usage() {
  cat <<'EOF'
Usage: bash scripts/auth_scrub_revoked_session_secrets.sh [--limit <count>] [--max-batches <count>] [--order <asc|desc>] [--stop-after-clean-overlap] [--execute] [--prod] [--help]

Audits revoked auth session rows and removes any remaining encrypted credential,
token-expiry, or refresh-lease fields in bounded cursor pages. The default target
is the configured Convex development deployment and the default mode is audit-only.
Production requires the explicit --prod flag; writes require --execute.
Newest-first overlap mode is for a reverse continuation after a proven clean
oldest-first prefix: it ignores an initial clean edge, drains eligible rows, and
stops only after entering a full clean overlap page.

Defaults:
  --limit 100
  --max-batches 200
  --order asc
  configured development deployment
  audit only; no row is changed without --execute
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

LIMIT="$DEFAULT_LIMIT"
MAX_BATCHES="$DEFAULT_MAX_BATCHES"
EXECUTE=false
PROD=false
ORDER="asc"
STOP_AFTER_CLEAN_OVERLAP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --order)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --order requires asc or desc" >&2
        exit 1
      }
      ORDER="$2"
      shift 2
      ;;
    --stop-after-clean-overlap)
      STOP_AFTER_CLEAN_OVERLAP=true
      shift
      ;;
    --execute)
      EXECUTE=true
      shift
      ;;
    --prod)
      PROD=true
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

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -le 0 ]]; then
  echo "FAIL: --limit must be a positive integer" >&2
  exit 1
fi
if [[ "$EXECUTE" == true && "$LIMIT" -gt 100 ]]; then
  echo "FAIL: --limit cannot exceed the write maximum of 100" >&2
  exit 1
fi
if [[ "$EXECUTE" != true && "$LIMIT" -gt 1000 ]]; then
  echo "FAIL: --limit cannot exceed the audit maximum of 1000" >&2
  exit 1
fi
if ! [[ "$MAX_BATCHES" =~ ^[0-9]+$ ]] || [[ "$MAX_BATCHES" -le 0 ]]; then
  echo "FAIL: --max-batches must be a positive integer" >&2
  exit 1
fi
if [[ "$ORDER" != "asc" && "$ORDER" != "desc" ]]; then
  echo "FAIL: --order must be asc or desc" >&2
  exit 1
fi
if [[ "$STOP_AFTER_CLEAN_OVERLAP" == true && "$ORDER" != "desc" ]]; then
  echo "FAIL: --stop-after-clean-overlap requires --order desc" >&2
  exit 1
fi

SECRET="$(lookup_key "ARX_AUTH_MIGRATION_AUDIT_SECRET")"
if [[ -z "$SECRET" ]]; then
  echo "FAIL: missing ARX_AUTH_MIGRATION_AUDIT_SECRET in env or repo-root .env/.env.local" >&2
  exit 1
fi

TARGET_LABEL="configured development deployment"
if [[ "$PROD" == true ]]; then
  TARGET_LABEL="production Convex deployment"
fi

echo "== Revoked auth session credential scrub =="
echo "Scope: ${TARGET_LABEL}"
echo "Batch limit: ${LIMIT}"
echo "Maximum batches: ${MAX_BATCHES}"
echo "Mode: $([[ "$EXECUTE" == true ]] && echo execute || echo audit-only)"
echo "Order: ${ORDER}"
echo "Stop after clean overlap: ${STOP_AFTER_CLEAN_OVERLAP}"

run_batch() {
  local dry_run="$1"
  local cursor_b64="$2"
  local args_json
  args_json="$(
    SECRET_VALUE="$SECRET" CURSOR_B64="$cursor_b64" LIMIT_VALUE="$LIMIT" DRY_RUN_VALUE="$dry_run" ORDER_VALUE="$ORDER" node -e '
      const cursor = JSON.parse(Buffer.from(process.env.CURSOR_B64 || "bnVsbA", "base64url").toString("utf8"));
      process.stdout.write(JSON.stringify({
        secret: process.env.SECRET_VALUE,
        cursor,
        limit: Number(process.env.LIMIT_VALUE),
        dryRun: process.env.DRY_RUN_VALUE === "true",
        order: process.env.ORDER_VALUE,
      }));
    '
  )"
  local attempt
  for attempt in 1 2 3 4 5; do
    if [[ "$PROD" == true ]]; then
      if npx convex run --prod --typecheck disable --codegen disable \
        authSessions:scrubRevokedAuthSessionSecretsForMaintenance \
        "$args_json"; then
        return 0
      fi
    else
      if npx convex run --typecheck disable --codegen disable \
        authSessions:scrubRevokedAuthSessionSecretsForMaintenance \
        "$args_json"; then
        return 0
      fi
    fi
    if [[ "$attempt" -lt 5 ]]; then
      echo "WARN: batch request failed; retrying attempt $((attempt + 1))/5" >&2
    fi
  done
  return 1
}

CURSOR_B64="$(node -e 'process.stdout.write(Buffer.from("null").toString("base64url"))')"
TOTAL_SCANNED=0
TOTAL_ELIGIBLE=0
TOTAL_SCRUBBED=0
SEEN_ELIGIBLE=false
DRY_RUN=true
if [[ "$EXECUTE" == true ]]; then
  DRY_RUN=false
fi

for ((batch = 1; batch <= MAX_BATCHES; batch += 1)); do
  RESULT="$(run_batch "$DRY_RUN" "$CURSOR_B64")"
  IFS=$'\t' read -r SCANNED ELIGIBLE SCRUBBED HAS_MORE DONE RESULT_DRY_RUN RESULT_ORDER NEXT_CURSOR_B64 < <(
    RESULT_JSON="$RESULT" node -e '
      const result = JSON.parse(process.env.RESULT_JSON || "{}");
      const required = ["scanned", "eligible", "scrubbed", "has_more", "done", "dry_run", "order", "continue_cursor"];
      for (const key of required) {
        if (!(key in result)) throw new Error(`auth_scrub_result_missing_${key}`);
      }
      const cursorB64 = Buffer.from(JSON.stringify(result.continue_cursor), "utf8").toString("base64url");
      console.log([
        result.scanned,
        result.eligible,
        result.scrubbed,
        result.has_more,
        result.done,
        result.dry_run,
        result.order,
        cursorB64,
      ].map(String).join("\t"));
    '
  )

  if [[ "$RESULT_DRY_RUN" != "$DRY_RUN" ]]; then
    echo "FAIL: server dry-run mode did not match requested mode" >&2
    exit 1
  fi
  if [[ "$RESULT_ORDER" != "$ORDER" ]]; then
    echo "FAIL: server order did not match requested order" >&2
    exit 1
  fi
  for value in "$SCANNED" "$ELIGIBLE" "$SCRUBBED"; do
    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
      echo "FAIL: invalid numeric scrub receipt" >&2
      exit 1
    fi
  done
  if [[ "$HAS_MORE" == true && ( "$SCANNED" -eq 0 || "$NEXT_CURSOR_B64" == "$CURSOR_B64" ) ]]; then
    echo "FAIL: scrub pagination made no truthful forward progress" >&2
    exit 1
  fi

  TOTAL_SCANNED=$((TOTAL_SCANNED + SCANNED))
  TOTAL_ELIGIBLE=$((TOTAL_ELIGIBLE + ELIGIBLE))
  TOTAL_SCRUBBED=$((TOTAL_SCRUBBED + SCRUBBED))
  echo "Batch ${batch}: scanned=${SCANNED} eligible=${ELIGIBLE} scrubbed=${SCRUBBED} has_more=${HAS_MORE}"

  if [[ "$ELIGIBLE" -gt 0 ]]; then
    SEEN_ELIGIBLE=true
  elif [[ "$STOP_AFTER_CLEAN_OVERLAP" == true && "$SEEN_ELIGIBLE" == true ]]; then
    echo "Complete overlap: scanned=${TOTAL_SCANNED} eligible=${TOTAL_ELIGIBLE} scrubbed=${TOTAL_SCRUBBED}."
    exit 0
  fi

  if [[ "$DONE" == true && "$HAS_MORE" == false ]]; then
    echo "Complete: scanned=${TOTAL_SCANNED} eligible=${TOTAL_ELIGIBLE} scrubbed=${TOTAL_SCRUBBED}."
    exit 0
  fi
  if [[ "$HAS_MORE" != true || "$DONE" != false ]]; then
    echo "FAIL: inconsistent scrub pagination receipt" >&2
    exit 1
  fi
  CURSOR_B64="$NEXT_CURSOR_B64"
done

echo "FAIL: reached --max-batches ${MAX_BATCHES} before completing the revoked-row scan" >&2
exit 1
