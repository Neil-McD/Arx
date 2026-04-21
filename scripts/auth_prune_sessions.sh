#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILES=(
  ".env.local"
  ".env"
)

DEFAULT_OLDER_THAN_DAYS=14
DEFAULT_LIMIT=500

usage() {
  cat <<'EOF'
Usage: bash scripts/auth_prune_sessions.sh [--older-than-days <days>] [--limit <count>] [--help]

Deletes revoked auth session rows older than the chosen retention window from the
production Convex deployment.

Defaults:
  --older-than-days 14
  --limit 500
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

SECRET="$(lookup_key "ARX_AUTH_MIGRATION_AUDIT_SECRET")"
if [[ -z "$SECRET" ]]; then
  echo "FAIL: missing ARX_AUTH_MIGRATION_AUDIT_SECRET in env or repo-root .env/.env.local" >&2
  exit 1
fi

CUTOFF_MS="$(node -e 'const days = Number(process.argv[1]); process.stdout.write(String(Date.now() - days * 24 * 60 * 60 * 1000));' "$OLDER_THAN_DAYS")"
ARGS_JSON="$(node -e 'const [secret, revokedBeforeMs, limit] = process.argv.slice(1); process.stdout.write(JSON.stringify({ secret, revokedBeforeMs: Number(revokedBeforeMs), limit: Number(limit) }));' "$SECRET" "$CUTOFF_MS" "$LIMIT")"

echo "== Auth session prune =="
echo "Scope: production Convex deployment"
echo "Retention: keep revoked rows newer than ${OLDER_THAN_DAYS} day(s)"
echo "Batch limit: ${LIMIT}"
echo "Cutoff ms: ${CUTOFF_MS}"

npx convex run --prod --typecheck disable --codegen disable \
  authSessions:pruneRevokedAuthSessionsForMaintenance \
  "$ARGS_JSON"
