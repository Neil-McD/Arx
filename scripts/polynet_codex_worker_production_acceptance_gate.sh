#!/usr/bin/env bash
set -euo pipefail

# Final production-readiness gate for the PolyNet Codex worker rail. This
# command is intentionally non-deploying, but it is not static-only: it must run
# the live production Fly worker proof after the static production gate. Use
# scripts/polynet_codex_worker_production_static_acceptance_gate.sh for PR-safe
# static validation.
#
# Required env for the live remote stage:
#   POLYNET_PRODUCTION_ACCEPTANCE_REMOTE=true
#   POLYNET_CODEX_WORKER_AUTH_TOKEN
# Required on Convex production before real worker turns:
#   POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET
# Optional overrides:
#   POLYNET_CODEX_WORKER_URL         (default: production Fly app)
#   POLYNET_CODEX_WORKER_INGEST_URL  (default: production Convex ingest)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n=== production acceptance: %s ===\n' "$1"
}

if [[ "${POLYNET_PRODUCTION_ACCEPTANCE_REMOTE:-}" != "true" ]]; then
  cat >&2 <<'EOF'
FAIL: final production acceptance requires live remote proof.

Use the static PR-safe gate instead:
  npm run check:polynet-codex-worker-production-static-acceptance

For final release acceptance, run with:
  POLYNET_PRODUCTION_ACCEPTANCE_REMOTE=true npm run check:polynet-codex-worker-production-acceptance
EOF
  exit 1
fi

step "static production gate"
npm run --silent check:polynet-codex-worker-production-static-acceptance

step "remote Fly production contract (live)"
npm run --silent check:polynet-codex-worker-fly-production-contract

printf '\nproduction acceptance gate: ALL STATIC AND LIVE STAGES PASS\n'
