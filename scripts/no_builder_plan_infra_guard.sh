#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(convex apps shared scripts docs package.json AGENTS.md)
EXCLUDES=(
  --glob '!scripts/no_builder_plan_infra_guard.sh'
  --glob '!convex/schema.ts'
)

FORBIDDEN_PATTERNS=(
  'startBuilderCheckout'
  'openBuilderBillingPortal'
  'syncBuilderStripeSubscriptionInternal'
  'createPendingBuilderCheckoutSessionInternal'
  'attachBuilderStripeCheckoutSessionInternal'
  'expireBuilderCheckoutSessionInternal'
  'getLatestBuilderBillingCycleForOwnerInternal'
  'getLatestBuilderBillingCustomerForOwnerInternal'
  'syncBuilderMonthlyCreditsInternal'
  'getActiveBuilderCreditProvisioningWindowInternal'
  'builder_checkout'
  'builder_subscription_synced'
  'builder_entitlement_granted'
  'builder_entitlement_revoked'
  'builder_plan_upgraded'
  'builder_plan_downgraded'
  'STRIPE_BUILDER_PRICE_ID'
  'ARX_STRIPE_BUILDER_PRICE_ID'
  'BUILDER_STRIPE_PRICE_ID'
  'readStripeBuilderPriceId'
  'isBuilderStripePriceId'
  'start_builder_checkout'
  'can_manage_plan'
  'builder_billing_customer_missing'
  'account_delete_active_builder_subscription_blocked'
)

failed=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if rg -n -S "$pattern" "${TARGETS[@]}" "${EXCLUDES[@]}"; then
    echo "Forbidden legacy Builder plan infrastructure pattern found: $pattern" >&2
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "PASS: no legacy Builder plan infrastructure references found."
