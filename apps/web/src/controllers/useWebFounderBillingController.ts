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
import { archiveCloudCommunity } from "../../../../shared/cloudCommunityAdminGateway";

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
  if (message.includes("community_restore_billing_cleanup_incomplete")) {
    return "Archive cleanup must finish before this community can be restored.";
  }
  if (message.includes("community_archive_forbidden")) {
    return "Only the community owner can manage this archive.";
  }
  return message.trim() || "Community billing is temporarily unavailable.";
}

export function useWebFounderBillingController(params: {
  session: AuthSession | null;
  ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  operatorComplimentaryAccess: boolean;
  onCommunityReady?: (
    communityId: string,
    session: AuthSession,
  ) => Promise<void> | void;
}) {
  const [overview, setOverview] = useState<CloudFounderBillingOverview>(
    EMPTY_FOUNDER_BILLING_OVERVIEW,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [actionCommunityId, setActionCommunityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ensureSessionRef = useRef(params.ensureSession);
  ensureSessionRef.current = params.ensureSession;
  const onCommunityReadyRef = useRef(params.onCommunityReady);
  onCommunityReadyRef.current = params.onCommunityReady;

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
      return;
    }
    void refresh(params.session);
  }, [params.session?.user.id, refresh]);

  useEffect(() => {
    const activeSession = params.session;
    if (!activeSession || typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const returningCommunityId = String(search.get("founder_community") ?? "").trim();
    if (!returningCommunityId) return;
    let canceled = false;
    let attempt = 0;
    const poll = async () => {
      if (canceled) return;
      attempt += 1;
      const next = await refresh(activeSession);
      if (!next) {
        if (attempt >= 12) {
          scrubCurrentRouteSearchParams(["founder_community", "session_id"]);
          return;
        }
        window.setTimeout(() => void poll(), 1_500);
        return;
      }
      const row = next.communities.find(
        (community) => community.community_id === returningCommunityId,
      );
      const isStillPending =
        row?.status === "managed_checkout_pending" ||
        row?.lifecycle_status === "archived";
      if (!isStillPending) {
        if (row?.lifecycle_status === "active") {
          await onCommunityReadyRef.current?.(returningCommunityId, activeSession);
        }
        scrubCurrentRouteSearchParams(["founder_community", "session_id"]);
        return;
      }
      if (attempt >= 12) {
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

  const watchArchiveCleanup = useCallback(async (communityId: string): Promise<void> => {
    if (typeof window === "undefined") return;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1_500));
      }
      const next = await refresh(params.session);
      if (!next) continue;
      const row = next?.communities.find(
        (community) => community.community_id === communityId,
      );
      if (
        !row ||
        row.lifecycle_status !== "archived" ||
        row.archive_billing_cleanup_status !== "pending"
      ) {
        return;
      }
    }
  }, [params.session, refresh]);

  const retryArchiveCleanup = useCallback(async (communityId: string): Promise<void> => {
    const usableSession = await ensureSessionRef.current(params.session);
    if (!usableSession) return;
    setActionCommunityId(communityId);
    setError(null);
    try {
      await archiveCloudCommunity({ session: usableSession, communityId });
      void watchArchiveCleanup(communityId);
    } catch (archiveError) {
      setError(messageForError(archiveError));
    } finally {
      setActionCommunityId(null);
    }
  }, [params.session, watchArchiveCleanup]);

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
        community.lifecycle_status === "active" &&
        community.funding_mode === "managed" &&
        [
          "builder_required",
          "checkout_pending",
          "builder_inactive",
          "builder_past_due",
          "builder_ended",
        ].includes(community.funding_state),
    ),
    refresh,
    startCheckout,
    startCheckoutAfterCommunityCreated,
    openPortal,
    retryArchiveCleanup,
    watchArchiveCleanup,
  };
}
