#!/usr/bin/env bash
set -euo pipefail

# Production-readiness gate for the PolyNet Codex worker rail. This command is
# intentionally non-deploying: it proves the production config, bridge contract,
# production data preflights, and web build. The live production worker proof is
# opt-in because it requires an intentionally deployed Fly production app plus
# Convex production worker env.
#
# Required env for the optional remote stage:
#   POLYNET_CODEX_WORKER_AUTH_TOKEN
# Optional overrides:
#   POLYNET_CODEX_WORKER_URL         (default: production Fly app)
#   POLYNET_CODEX_WORKER_INGEST_URL  (default: production Convex ingest)
# Run the live remote stage: POLYNET_PRODUCTION_ACCEPTANCE_REMOTE=true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n=== production acceptance: %s ===\n' "$1"
}

step "git diff --check (whitespace hygiene)"
git diff --check

step "production guard"
npm run --silent check:polynet-codex-worker-production

step "production Fly config proof"
npm run --silent check:polynet-codex-worker-fly-production-config

step "Convex bridge contract proof"
npm run --silent check:polynet-codex-worker-convex-bridge-contract

step "workspace provider pointer prod preflight"
npm run --silent preflight:workspace-provider-pointers:prod

step "workspace included credits prod preflight"
npm run --silent preflight:workspace-included-credits:prod

step "web typecheck"
npm run --silent check:web-typecheck

step "web build"
npm run --silent build

if [[ "${POLYNET_PRODUCTION_ACCEPTANCE_REMOTE:-}" == "true" ]]; then
  step "remote Fly production contract (live)"
  npm run --silent check:polynet-codex-worker-fly-production-contract
  printf '\nproduction acceptance gate: ALL STAGES PASS\n'
  exit 0
fi

printf '\nproduction acceptance gate: STATIC STAGES PASS (remote stage skipped by default)\n'
