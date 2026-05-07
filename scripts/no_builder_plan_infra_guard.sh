#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(convex apps shared scripts docs package.json AGENTS.md)
EXCLUDES=(
  --glob '!scripts/no_builder_plan_infra_guard.sh'
  --glob '!convex/schema.ts'
  --glob '!docs/archive/**'
  --glob '!docs/product/generated/**'
  --glob '!docs/product/llms*.txt'
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
  'BuilderUpgrade'
  'builder upgrade'
  'openBuilderUpgrade'
  'isBuilderUpgradeOpen'
  'setIsBuilderUpgradeOpen'
  'BuilderUpgradeContextValue'
  'hasBuilderTierPaidAccess'
  'hasBuilderWorkbenchAccess'
  'hasBuilderProjectAccess'
  'tierHasBuilderAccess'
  'WORKBENCH_TIER_SET'
  'hasPaidAccessForGate'
  'setDevBuilderTier\("builder"\)'
  'return "builder";'
  'normalizeBuilderTier\(raw: unknown\): "builder"'
)

failed=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if rg -n -S "$pattern" "${TARGETS[@]}" "${EXCLUDES[@]}"; then
    echo "Forbidden legacy Builder plan infrastructure pattern found: $pattern" >&2
    failed=1
  fi
done

PROJECT_TIER_GATE_PATTERNS=(
  'canonicalTier === "free"'
  'canonicalTier !== "free"'
  'plan_required'
  'tier_required'
)

for pattern in "${PROJECT_TIER_GATE_PATTERNS[@]}"; do
  if rg -n -S "$pattern" convex/projects.ts convex/threads.ts; then
    echo "Forbidden project/workspace tier gate found: $pattern" >&2
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "PASS: no legacy Builder plan infrastructure references found."
