#!/usr/bin/env bash
set -euo pipefail

# The PolyNet Codex worker acceptance gate. This is the ONLY definition of
# "all proofs green" for the worker system: every check here buys confidence
# in the deployed architecture. Dev conveniences (local service proof, POC
# scripts, ad hoc smoke loops) are deliberately NOT part of this gate — see
# docs/polynet-codex-worker-fly-staging.md "Proof Hierarchy".
#
# Required env for the remote stage:
#   POLYNET_CODEX_WORKER_AUTH_TOKEN  (worker bearer)
# Optional overrides:
#   POLYNET_CODEX_WORKER_URL         (default: staging Fly app)
#   POLYNET_CODEX_WORKER_INGEST_URL  (default: staging Convex ingest)
# Skip the live remote stage (static-only run): POLYNET_ACCEPTANCE_STATIC_ONLY=true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n=== acceptance: %s ===\n' "$1"
}

step "git diff --check (whitespace hygiene)"
git diff --check

step "staging guard"
npm run --silent check:polynet-codex-worker-staging

step "Fly config proof"
npm run --silent check:polynet-codex-worker-fly-config

step "Convex bridge contract proof"
npm run --silent check:polynet-codex-worker-convex-bridge-contract

step "provider cost accounting proof"
npm run --silent check:provider-cost-accounting-proof

step "workspace credit accounting behavior"
npm run --silent check:workspace-credit-accounting-behavior

step "Blaxel workspace lifecycle accounting proof"
npm run --silent check:blaxel-workspace-lifecycle-accounting-proof

step "workspace resource admission policy proof"
npm run --silent check:workspace-resource-admission-policy-proof

step "runtime turn contract guard"
npm run --silent check:runtime-turn-contract-guard

step "web typecheck"
npm run --silent check:web-typecheck

step "web build"
npm run --silent build

if [[ "${POLYNET_ACCEPTANCE_STATIC_ONLY:-}" == "true" ]]; then
  printf '\nacceptance gate: STATIC STAGES PASS (remote stage skipped by request)\n'
  exit 0
fi

step "remote Fly staging contract (multi-machine, live)"
POLYNET_CODEX_WORKER_URL="${POLYNET_CODEX_WORKER_URL:-https://polynet-codex-worker-staging.fly.dev}" \
POLYNET_CODEX_WORKER_INGEST_URL="${POLYNET_CODEX_WORKER_INGEST_URL:-https://quick-porcupine-949.convex.site/runtime/polynet_codex_worker_ingest}" \
POLYNET_CODEX_WORKER_EXPECT_MULTI_MACHINE=true \
npm run --silent check:polynet-codex-worker-fly-staging-contract

printf '\nacceptance gate: ALL STAGES PASS\n'
