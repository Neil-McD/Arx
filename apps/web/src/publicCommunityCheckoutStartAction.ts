import type { CommunityBillingPeriod } from "../../../shared/communityTypes";
import type { PublicCommunityCheckoutStartResult } from "../../../shared/cloudPublicFunnelGateway";
import { normalizeCommunitySlugIdentity } from "../../../shared/communitySlug";

export type PublicCommunityCheckoutStartSnapshot = {
  generation: number;
  communitySlug: string;
  billingPeriod: CommunityBillingPeriod;
  authSubject: string;
  routeAuthority: string;
  checkoutAttemptId: string;
};

export function isPublicCommunityCheckoutStartSnapshotCurrent(args: {
  snapshot: PublicCommunityCheckoutStartSnapshot;
  current: {
    generation: number;
    communitySlug: string | null;
    billingPeriod: CommunityBillingPeriod | null;
    authSubject: string | null;
    routeAuthority: string;
  };
}): boolean {
  return (
    args.snapshot.generation === args.current.generation &&
    args.snapshot.communitySlug === normalizeCommunitySlugIdentity(args.current.communitySlug) &&
    args.snapshot.billingPeriod === args.current.billingPeriod &&
    args.snapshot.authSubject === String(args.current.authSubject ?? "").trim() &&
    args.snapshot.routeAuthority === args.current.routeAuthority
  );
}

export async function executePublicCommunityCheckoutStartAction(args: {
  runCheckout: () => Promise<PublicCommunityCheckoutStartResult>;
  isCurrent: () => boolean;
  navigateToUrl: (url: string) => void;
  setError: (message: string | null) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}): Promise<
  | { outcome: "redirected" }
  | { outcome: "stale" }
  | { outcome: "failed"; message: string }
> {
  if (!args.isCurrent()) return { outcome: "stale" };
  try {
    const result = await args.runCheckout();
    if (!args.isCurrent()) return { outcome: "stale" };
    args.setError(null);
    args.navigateToUrl(result.checkout_url);
    return { outcome: "redirected" };
  } catch (error) {
    if (!args.isCurrent()) return { outcome: "stale" };
    const message = args.getErrorMessage(error, "Failed to start checkout.");
    args.setError(message);
    return { outcome: "failed", message };
  }
}
