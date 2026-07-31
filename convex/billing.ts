import * as communityCommerce from "./communityCommerce";
import * as creatorCommerce from "./creatorCommerce";
import * as premiumBilling from "./premiumBilling";
import * as stripeCustomers from "./stripeCustomers";

// Rolling-deployment facade for the production web build at dbec82f.
// Canonical ownership remains in the domain modules on the right-hand side.
export const finalizeCheckoutSession =
  communityCommerce.finalizeCheckoutSession;
export const listPendingPurchaseClaims =
  communityCommerce.listPendingPurchaseClaims;
export const redeemPendingPurchaseClaims =
  communityCommerce.redeemPendingPurchaseClaims;
export const redeemPurchaseClaim = communityCommerce.redeemPurchaseClaim;
export const startPublicCommunityCheckout =
  communityCommerce.startPublicCommunityCheckout;
export const refreshWorkspaceCardOnFileStatus =
  stripeCustomers.refreshWorkspaceCardOnFileStatus;
export const startWorkspaceCardSetupCheckout =
  stripeCustomers.startWorkspaceCardSetupCheckout;
export const startConnectOnboarding = creatorCommerce.startConnectOnboarding;
export const startPremiumSubscriptionCheckout =
  premiumBilling.startPremiumSubscriptionCheckout;
