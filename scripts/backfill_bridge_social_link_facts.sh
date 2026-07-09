#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"

DRY_RUN="1"
MAX_PROFILES="250"
MAX_INSERTS="100"
CURSOR=""
AUTH_SUBJECT="${POLYNET_OPERATOR_AUTH_SUBJECT:-${OPERATOR_AUTH_SUBJECT:-}}"
ALLOW_ANY_DEPLOYMENT="0"

usage() {
  cat <<'EOF'
Usage: bash scripts/backfill_bridge_social_link_facts.sh [options]

Backfills completed profile social links into platform-scoped stated_bridge
memberFacts. Defaults to a dry run against the staging Convex deployment.

Options:
  --write                    Insert missing facts. Default is dry run.
  --dry-run                  Report missing facts without inserting.
  --max-profiles <count>     Max profile rows to scan. Default 250.
  --max-inserts <count>      Max link facts to insert on --write. Default 100.
  --cursor <cursor>          Continue from a previous result's next_cursor.
  --auth-subject <subject>   Operator auth subject. Defaults to POLYNET_OPERATOR_AUTH_SUBJECT or OPERATOR_AUTH_SUBJECT.
  --allow-any-deployment     Allow CONVEX_DEPLOYMENT other than staging.
  -h, --help                 Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write)
      DRY_RUN="0"
      shift
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --max-profiles)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --max-profiles requires a value" >&2
        exit 1
      }
      MAX_PROFILES="$2"
      shift 2
      ;;
    --max-inserts)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --max-inserts requires a value" >&2
        exit 1
      }
      MAX_INSERTS="$2"
      shift 2
      ;;
    --cursor)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --cursor requires a value" >&2
        exit 1
      }
      CURSOR="$2"
      shift 2
      ;;
    --auth-subject)
      [[ $# -ge 2 ]] || {
        echo "FAIL: --auth-subject requires a value" >&2
        exit 1
      }
      AUTH_SUBJECT="$2"
      shift 2
      ;;
    --allow-any-deployment)
      ALLOW_ANY_DEPLOYMENT="1"
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

if ! [[ "$MAX_PROFILES" =~ ^[0-9]+$ ]] || [[ "$MAX_PROFILES" -le 0 ]]; then
  echo "FAIL: --max-profiles must be a positive integer" >&2
  exit 1
fi

if ! [[ "$MAX_INSERTS" =~ ^[0-9]+$ ]] || [[ "$MAX_INSERTS" -le 0 ]]; then
  echo "FAIL: --max-inserts must be a positive integer" >&2
  exit 1
fi

if [[ -z "$AUTH_SUBJECT" ]]; then
  echo "FAIL: missing operator auth subject. Set POLYNET_OPERATOR_AUTH_SUBJECT or pass --auth-subject." >&2
  exit 1
fi

if [[ -z "${CONVEX_DEPLOYMENT:-}" ]]; then
  export CONVEX_DEPLOYMENT="$EXPECTED_CONVEX_DEPLOYMENT"
elif [[ "$CONVEX_DEPLOYMENT" != "$EXPECTED_CONVEX_DEPLOYMENT" && "$ALLOW_ANY_DEPLOYMENT" != "1" ]]; then
  echo "FAIL: CONVEX_DEPLOYMENT must be $EXPECTED_CONVEX_DEPLOYMENT, got $CONVEX_DEPLOYMENT" >&2
  echo "Use --allow-any-deployment only after intentionally choosing another deployment." >&2
  exit 1
fi

ARGS_JSON="$(
  AUTH_SUBJECT="$AUTH_SUBJECT" \
  DRY_RUN="$DRY_RUN" \
  MAX_PROFILES="$MAX_PROFILES" \
  MAX_INSERTS="$MAX_INSERTS" \
  CURSOR="$CURSOR" \
  node <<'NODE'
const maxProfiles = Number(process.env.MAX_PROFILES);
const maxInserts = Number(process.env.MAX_INSERTS);
const cursor = process.env.CURSOR || null;
process.stdout.write(JSON.stringify({
  authSubject: process.env.AUTH_SUBJECT,
  dryRun: process.env.DRY_RUN !== "0",
  maxProfiles,
  maxInserts,
  cursor,
}));
NODE
)"

echo "== Bridge social-link fact backfill =="
echo "Convex deployment: $CONVEX_DEPLOYMENT"
echo "Mode: $([[ "$DRY_RUN" == "1" ]] && echo "dry-run" || echo "write")"
echo "Max profiles: $MAX_PROFILES"
echo "Max inserts: $MAX_INSERTS"
echo "Cursor: ${CURSOR:-<start>}"

npx convex run --typecheck disable --codegen disable \
  profiles:backfillCompletedProfileBridgeSocialLinkFacts \
  "$ARGS_JSON"
