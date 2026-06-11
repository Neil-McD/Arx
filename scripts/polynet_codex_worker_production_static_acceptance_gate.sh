#!/usr/bin/env bash
set -euo pipefail

# Static production-readiness gate for the PolyNet Codex worker rail. This
# command is intentionally non-deploying and does not contact the production Fly
# worker. It proves production config, bridge contracts, production data
# preflights, and web build safety for PR/review confidence.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n=== production static acceptance: %s ===\n' "$1"
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

printf '\nproduction static acceptance gate: STATIC STAGES PASS\n'
