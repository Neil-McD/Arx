import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_FOUNDER_BILLING_OVERVIEW,
  loadCloudFounderBillingOverview,
  startCloudFounderBillingPortal,
  startCloudFounderSubscriptionCheckout,
  type CloudFounderBillingOverview,
} from "../../../../shared/cloudFounderBillingGateway";
import type { AuthSession } from "../auth";
import { scrubCurrentRouteSearchParams } from "../webAppRuntime";

function messageForError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("founder_subscription_checkout_already_pending")) {
    return "Checkout is already processing for this community. Refresh in a moment.";
  }
  if (message.includes("founder_subscription_community_already_managed")) {
    return "This community already has a managed subscription.";
  }
  if (message.includes("operator_billing_exempt")) {
    return "Operator access is already included for this community.";
  }
  if (message.includes("profile_setup_required")) {
    return "Finish your profile before starting community billing.";
  }
  if (message.includes("founder_stripe_price")) {
    return "The $79 community plan is not configured correctly yet.";
  }
  return message.trim() || "Community billing is temporarily unavailable.";
}

export function useWebFounderBillingController(params: {
  session: AuthSession | null;
  ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  operatorComplimentaryAccess: boolean;
}) {
  const [overview, setOverview] = useState<CloudFounderBillingOverview>(
    EMPTY_FOUNDER_BILLING_OVERVIEW,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [actionCommunityId, setActionCommunityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFundingPromptDismissed, setIsFundingPromptDismissed] = useState(false);
  const ensureSessionRef = useRef(params.ensureSession);
  ensureSessionRef.current = params.ensureSession;

  const refresh = useCallback(async (
    session?: AuthSession | null,
  ): Promise<CloudFounderBillingOverview | null> => {
    const usableSession = await ensureSessionRef.current(session ?? undefined);
    if (!usableSession) return null;
    setIsLoading(true);
    try {
      const next = await loadCloudFounderBillingOverview({ session: usableSession });
      setOverview(next);
      setError(null);
      return next;
    } catch (loadError) {
      setError(messageForError(loadError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!params.session) {
      setOverview(EMPTY_FOUNDER_BILLING_OVERVIEW);
      setIsLoading(false);
      setActionCommunityId(null);
      setError(null);
      setIsFundingPromptDismissed(false);
      return;
    }
    setIsFundingPromptDismissed(false);
    void refresh(params.session);
  }, [params.session?.user.id, refresh]);

  useEffect(() => {
    if (!params.session || typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const returningCommunityId = String(search.get("founder_community") ?? "").trim();
    if (!returningCommunityId) return;
    let canceled = false;
    let attempt = 0;
    const poll = async () => {
      if (canceled) return;
      attempt += 1;
      const next = await refresh(params.session);
      const row = next?.communities.find(
        (community) => community.community_id === returningCommunityId,
      );
      const isStillPending = row?.status === "managed_checkout_pending";
      if (!isStillPending || attempt >= 6) {
        scrubCurrentRouteSearchParams(["founder_community", "session_id"]);
        return;
      }
      window.setTimeout(() => void poll(), 1_500);
    };
    void poll();
    return () => {
      canceled = true;
    };
  }, [params.session, refresh]);

  const startCheckout = useCallback(async (communityId: string): Promise<void> => {
    const usableSession = await ensureSessionRef.current(params.session);
    if (!usableSession) return;
    if (params.operatorComplimentaryAccess) {
      await refresh(usableSession);
      return;
    }
    setActionCommunityId(communityId);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/settings/billing?founder_community=${encodeURIComponent(communityId)}`;
      const result = await startCloudFounderSubscriptionCheckout({
        session: usableSession,
        communityId,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
      });
      window.location.assign(result.checkout_url);
    } catch (checkoutError) {
      setError(messageForError(checkoutError));
      setActionCommunityId(null);
    }
  }, [params.operatorComplimentaryAccess, params.session, refresh]);

  const openPortal = useCallback(async (communityId: string): Promise<void> => {
    const usableSession = await ensureSessionRef.current(params.session);
    if (!usableSession) return;
    setActionCommunityId(communityId);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/settings/billing`;
      const result = await startCloudFounderBillingPortal({
        session: usableSession,
        communityId,
        returnUrl,
      });
      window.location.assign(result.portal_url);
    } catch (portalError) {
      setError(messageForError(portalError));
      setActionCommunityId(null);
    }
  }, [params.session]);

  const startCheckoutAfterCommunityCreated = useCallback(async (
    communityId: string,
  ): Promise<void> => {
    if (params.operatorComplimentaryAccess) {
      await refresh();
      return;
    }
    const next = await refresh();
    if (
      next?.communities.some(
        (community) =>
          community.community_id === communityId &&
          community.funding_mode === "operator_comp",
      )
    ) return;
    await startCheckout(communityId);
  }, [params.operatorComplimentaryAccess, refresh, startCheckout]);

  return {
    overview,
    isLoading,
    actionCommunityId,
    error,
    fundingAttentionCommunities: overview.communities.filter(
      (community) =>
        community.funding_mode === "managed" &&
        [
          "managed_required",
          "managed_checkout_pending",
          "past_due",
          "canceled",
          "ended",
        ].includes(community.status),
    ),
    isFundingPromptDismissed,
    dismissFundingPrompt: () => setIsFundingPromptDismissed(true),
    refresh,
    startCheckout,
    startCheckoutAfterCommunityCreated,
    openPortal,
  };
}
