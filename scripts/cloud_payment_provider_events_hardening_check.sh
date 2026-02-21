#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Cloud payment-provider-events hardening check =="

MIGRATIONS_DIR="supabase/migrations"
WEBHOOK_FILE="supabase/functions/stripe_webhook/index.ts"

require_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -n "$pattern" "$file" >/dev/null; then
    echo "FAIL: $message"
    exit 1
  fi
}

echo "[1/5] Hardening migration surface must exist..."
MIGRATION_FILE="$(rg -l --glob '*.sql' "payment_provider_events_restrict_mutation\\(\\)" "$MIGRATIONS_DIR" | head -n1 || true)"
if [[ -z "$MIGRATION_FILE" ]]; then
  echo "FAIL: missing payment_provider_events hardening migration in $MIGRATIONS_DIR"
  exit 1
fi

echo "[2/5] Migration must lock payment_provider_events table grants to service_role..."
require_pattern "$MIGRATION_FILE" "revoke all on table public\\.payment_provider_events from anon;" "migration missing anon revoke on payment_provider_events"
require_pattern "$MIGRATION_FILE" "revoke all on table public\\.payment_provider_events from authenticated;" "migration missing authenticated revoke on payment_provider_events"
require_pattern "$MIGRATION_FILE" "grant all on table public\\.payment_provider_events to service_role;" "migration missing service_role grant on payment_provider_events"

echo "[3/5] Migration must define immutable mutation guard trigger(s)..."
require_pattern "$MIGRATION_FILE" "create or replace function public\\.payment_provider_events_restrict_mutation\\(\\)" "missing payment_provider_events_restrict_mutation function"
require_pattern "$MIGRATION_FILE" "create trigger trg_payment_provider_events_restrict_update" "missing update trigger on payment_provider_events"
require_pattern "$MIGRATION_FILE" "create trigger trg_payment_provider_events_restrict_delete" "missing delete trigger on payment_provider_events"

echo "[4/5] Stripe webhook dedupe must avoid merge-duplicate updates..."
require_pattern "$WEBHOOK_FILE" "resolution=ignore-duplicates,return=representation" "stripe_webhook must use ignore-duplicates for payment_provider_events"
if rg -n "resolution=merge-duplicates,return=representation" "$WEBHOOK_FILE" >/dev/null; then
  echo "FAIL: stripe_webhook still uses merge-duplicates for payment_provider_events"
  exit 1
fi

echo "[5/5] Stripe webhook must still use processed_at idempotency marker..."
require_pattern "$WEBHOOK_FILE" "processed_at" "stripe_webhook no longer references processed_at marker"
require_pattern "$WEBHOOK_FILE" "markProviderEventProcessed" "stripe_webhook no longer marks provider events as processed"

echo "PASS: cloud payment-provider-events hardening check passed."
