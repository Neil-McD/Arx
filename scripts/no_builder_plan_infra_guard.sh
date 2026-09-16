#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

TARGETS=(convex apps shared scripts docs package.json AGENTS.md)
EXCLUDES=(
  --glob '!scripts/no_builder_plan_infra_guard.sh'
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
  'BUILDER_MAX_PROJECTS'
  'BuilderIncludedModal'
  'builderIncludedModalProps'
  'isBuilderInfoOpen'
  'setIsBuilderInfoOpen'
  'hasBuilderAccess'
  'onOpenBuilderInfo'
  'builderRailCta'
  'showBuilderLimitInfoIfNeeded'
)

failed=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if ! guard_rg_assert_absent \
    "legacy Builder plan infrastructure pattern: $pattern" \
    -n -S "$pattern" "${TARGETS[@]}" "${EXCLUDES[@]}"; then
    failed=1
  fi
done

PUBLIC_LANDING_TARGETS=(
  apps/web/src/components/polynetLanding/ConversionLanding.tsx
  apps/web/src/components/polynetLanding/ConversionLanding.css
)
PUBLIC_PRICING_FORBIDDEN_PATTERNS=(
  'Start free'
  'No card'
  'Live in an afternoon'
  "You don't pay until you get paid"
  "Pro, when you're ready"
  'No monthly bill'
  'free until your community pays'
  'optional Pro'
  'AI-first community platform'
  'premium-simplified'
  'GPT 5\.6'
  '\bLuna\b'
  '\$20\b'
  'AI credits?'
  '\btokens?\b'
)

for pattern in "${PUBLIC_PRICING_FORBIDDEN_PATTERNS[@]}"; do
  if ! guard_rg_assert_absent \
    "retired or internal public-pricing claim: $pattern" \
    -n -i "$pattern" "${PUBLIC_LANDING_TARGETS[@]}"; then
    failed=1
  fi
done

if ! guard_rg_assert_absent \
  "retired Builder plan Stripe price env" \
  -n -S 'STRIPE_BUILDER_PLAN_(BUILDER|PRO)_PRICE_ID' .env.example; then
  failed=1
fi

ACCOUNT_NAMING_TARGETS=(convex apps shared docs package.json AGENTS.md)
ACCOUNT_NAMING_FORBIDDEN_PATTERNS=(
  'builderBillingStatusGateway'
  'builderBilling'
  'cloudBuilderBillingGateway'
  'builderCommerce'
  'getBuilderBillingStatus'
  'getBuilderCommerceAccessForUserInternal'
  'builder_tier'
  'builderTier'
  'BuilderBilling'
  'BuilderTier'
  'BuilderConnect'
  'setDevBuilderTier'
  'loadBuilderBillingStatus'
  'builder connect'
  'Builder connect'
  'builder commerce'
  'Builder commerce'
  'builder tier'
  'Builder tier'
)

for pattern in "${ACCOUNT_NAMING_FORBIDDEN_PATTERNS[@]}"; do
  if ! guard_rg_assert_absent \
    "legacy Builder account-commerce naming: $pattern" \
    -n -S "$pattern" "${ACCOUNT_NAMING_TARGETS[@]}" "${EXCLUDES[@]}"; then
    failed=1
  fi
done

SCHEMA_FORBIDDEN_PATTERNS=(
  'builder_upgrade'
  'targetTier'
)

for pattern in "${SCHEMA_FORBIDDEN_PATTERNS[@]}"; do
  if ! guard_rg_assert_absent \
    "legacy Builder plan schema pattern: $pattern" \
    -n -S "$pattern" convex/schema.ts; then
    failed=1
  fi
done

if node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const source = readFileSync("convex/schema.ts", "utf8");
const block = source.match(/userEntitlements: defineTable\(\{[\s\S]*?\n  \}\)/)?.[0] ?? "";
process.exit(block.includes('v.literal("builder")') ? 0 : 1);
NODE
then
  echo "Forbidden legacy Builder plan tier found: userEntitlements.tier builder" >&2
  failed=1
fi

if node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const source = readFileSync("convex/schema.ts", "utf8");
const block = source.match(/userEntitlements: defineTable\(\{[\s\S]*?\n  \}\)/)?.[0] ?? "";
process.exit(block.includes('v.literal("stripe")') ? 0 : 1);
NODE
then
  echo "Forbidden legacy Builder plan entitlement source found: userEntitlements.source stripe" >&2
  failed=1
fi

PROJECT_TIER_GATE_PATTERNS=(
  'canonicalTier === "free"'
  'canonicalTier !== "free"'
  'plan_required'
  'tier_required'
)

for pattern in "${PROJECT_TIER_GATE_PATTERNS[@]}"; do
  if ! guard_rg_assert_absent \
    "thread tier gate: $pattern" \
    -n -S "$pattern" convex/threads.ts; then
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "PASS: no legacy account-tier Builder plan infrastructure references found."
