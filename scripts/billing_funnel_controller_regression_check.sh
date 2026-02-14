#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
DESKTOP_BILLING_HOOK="src/controllers/desktop/useDesktopBuilderBillingActions.ts"
WEB_BILLING_HOOK="apps/web/src/controllers/useWebBuilderBillingActions.ts"
WEB_COMMERCE_HOOK="apps/web/src/controllers/useWebCommerceAffiliateActions.ts"
CHECKOUT_FINALIZE_HOOK="shared/useCheckoutFinalizeController.ts"

echo "== Billing/funnel controller regression checks =="

echo "[1/10] Desktop and web app shells should import billing/commerce controller hooks..."
if ! grep -q "from \"./controllers/desktop/useDesktopBuilderBillingActions\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useDesktopBuilderBillingActions"
  exit 1
fi
if ! grep -q "from \"./controllers/useWebBuilderBillingActions\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useWebBuilderBillingActions"
  exit 1
fi
if ! grep -q "from \"./controllers/useWebCommerceAffiliateActions\"" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing useWebCommerceAffiliateActions"
  exit 1
fi

echo "[2/10] Desktop app should not keep inline billing action handlers..."
if grep -q "async function startBuilderPlanCheckout" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline startBuilderPlanCheckout"
  exit 1
fi
if grep -q "async function openBuilderBillingPortal" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline openBuilderBillingPortal"
  exit 1
fi
if grep -q "async function startConnectOnboarding" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx still defines inline startConnectOnboarding"
  exit 1
fi

echo "[3/10] Web app should not keep inline billing action handlers..."
if grep -q "async function startBuilderPlanCheckout" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline startBuilderPlanCheckout"
  exit 1
fi
if grep -q "async function openBuilderBillingPortal" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline openBuilderBillingPortal"
  exit 1
fi
if grep -q "async function startConnectOnboarding" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline startConnectOnboarding"
  exit 1
fi

echo "[4/10] Web app should not keep inline claim/affiliate action handlers..."
if grep -q "async function redeemPurchaseClaim" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline redeemPurchaseClaim"
  exit 1
fi
if grep -q "async function loadPendingPurchaseClaims" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline loadPendingPurchaseClaims"
  exit 1
fi
if grep -q "async function redeemPendingPurchases" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline redeemPendingPurchases"
  exit 1
fi
if grep -q "async function loadBuilderBillingStatus" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline loadBuilderBillingStatus"
  exit 1
fi
if grep -q "async function loadAffiliateDashboard" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline loadAffiliateDashboard"
  exit 1
fi
if grep -q "async function applyPendingAffiliateReferral" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline applyPendingAffiliateReferral"
  exit 1
fi
if grep -q "async function handleDevSetBuilderTier" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still defines inline handleDevSetBuilderTier"
  exit 1
fi

echo "[5/10] App shells should instantiate extracted hooks..."
if ! grep -q "const { startBuilderPlanCheckout, openBuilderBillingPortal, startConnectOnboarding } =" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not wiring billing actions via hook return"
  exit 1
fi
if ! grep -q "useWebBuilderBillingActions({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring useWebBuilderBillingActions"
  exit 1
fi
if ! grep -q "useWebCommerceAffiliateActions({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring useWebCommerceAffiliateActions"
  exit 1
fi

echo "[6/10] Checkout finalize polling should remain in shared hook..."
if ! grep -q "const { retryCheckoutFinalize } = useCheckoutFinalizeController({" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not wiring useCheckoutFinalizeController with retry handle"
  exit 1
fi
if grep -q "checkout_finalize?session_id=" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx still contains inline checkout_finalize polling request"
  exit 1
fi
if ! grep -q "checkout_finalize?session_id=" "$CHECKOUT_FINALIZE_HOOK"; then
  echo "FAIL: shared useCheckoutFinalizeController is missing checkout_finalize request"
  exit 1
fi

echo "[7/10] Desktop billing hook should keep sign-in gate and external-open semantics..."
if ! grep -q "requireSignIn" "$DESKTOP_BILLING_HOOK"; then
  echo "FAIL: desktop billing hook missing requireSignIn dependency"
  exit 1
fi
if ! grep -q "openExternalUrl" "$DESKTOP_BILLING_HOOK"; then
  echo "FAIL: desktop billing hook missing openExternalUrl dependency"
  exit 1
fi

echo "[8/10] Web billing hook should keep auth-intent gates..."
if ! grep -q "reason: \"start_builder_checkout\"" "$WEB_BILLING_HOOK"; then
  echo "FAIL: web billing hook missing start_builder_checkout auth intent gate"
  exit 1
fi
if ! grep -q "reason: \"open_builder_billing_portal\"" "$WEB_BILLING_HOOK"; then
  echo "FAIL: web billing hook missing open_builder_billing_portal auth intent gate"
  exit 1
fi
if ! grep -q "reason: \"start_payouts_onboarding\"" "$WEB_BILLING_HOOK"; then
  echo "FAIL: web billing hook missing start_payouts_onboarding auth intent gate"
  exit 1
fi

echo "[9/10] Web commerce hook should keep pay-first RPC integrations..."
if ! grep -q "redeemPurchaseClaimRpc" "$WEB_COMMERCE_HOOK"; then
  echo "FAIL: web commerce hook missing redeemPurchaseClaimRpc integration"
  exit 1
fi
if ! grep -q "listPendingPurchaseClaimsRpc" "$WEB_COMMERCE_HOOK"; then
  echo "FAIL: web commerce hook missing listPendingPurchaseClaimsRpc integration"
  exit 1
fi
if ! grep -q "redeemPendingPurchaseClaimsRpc" "$WEB_COMMERCE_HOOK"; then
  echo "FAIL: web commerce hook missing redeemPendingPurchaseClaimsRpc integration"
  exit 1
fi
if ! grep -q "reason: \"redeem_pending_purchases\"" "$WEB_COMMERCE_HOOK"; then
  echo "FAIL: web commerce hook missing redeem_pending_purchases auth intent gate"
  exit 1
fi

echo "[10/10] Web app retry CTA should use shared finalize retry callback..."
if ! grep -q "onClick={retryCheckoutFinalize}" "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx checkout retry button is not using retryCheckoutFinalize callback"
  exit 1
fi

echo "PASS: billing/funnel controller regression checks passed."
