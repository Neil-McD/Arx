import { useCallback, useEffect, useRef, useState } from "react";

import type { AccountSetupStatus } from "../../../../shared/accountSetup";
import {
  claimCloudFounderCheckoutReceipt,
  claimCloudFounderCheckoutReceiptByVerifiedEmail,
  loadCloudFounderBillingOverview,
  loadCloudFounderCheckoutReceiptStatus,
  startCloudPublicBuilderCheckout,
} from "../../../../shared/cloudFounderBillingGateway";
import {
  attachFounderCheckoutSession,
  buildFounderCheckoutReturnUrls,
  clearPendingFounderCheckout,
  parseFounderCheckoutReturn,
  pendingFounderCheckoutMatchesSession,
  readPendingFounderCheckout,
  recoverPendingFounderCheckout,
  resolveFounderCheckoutStartReceipt,
  runWithFounderCheckoutStartLock,
  storePendingFounderCheckout,
} from "../../../../shared/founderCheckoutBrowserState";
import type { CreateCommunityIntentDraft } from "../../../../shared/createCommunityIntent";
import type { AuthSession } from "../auth";
import { scrubCurrentRouteSearchParams } from "../webAppRuntime";

export type BuilderPurchaseActivationStatus =
  | "idle"
  | "starting_checkout"
  | "confirming_payment"
  | "authentication_required"
  | "setup_required"
  | "claiming"
  | "ready_to_create"
  | "canceled"
  | "error";

const MAX_RECEIPT_POLL_ATTEMPTS = 12;

function formatActivationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("founder_checkout_recovery_email_mismatch")) {
    return "Sign in with the verified email used at checkout to continue.";
  }
  if (message.includes("founder_checkout_receipt_expired")) {
    return "This checkout receipt expired. Start a new Builder checkout.";
  }
  if (message.includes("founder_checkout_receipt_already_claimed")) {
    return "This purchase belongs to another account.";
  }
  if (message.includes("founder_checkout_receipt_not_found")) {
    return "We could not find this Builder checkout. Use the recovery link sent to your payment email.";
  }
  return message.trim() || "We could not activate your Builder purchase.";
}

export function useWebBuilderPurchaseActivationController(params: {
  session: AuthSession | null;
  isAuthBootstrapComplete: boolean;
  ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  accountSetupStatus: AccountSetupStatus | null;
  requireSignIn: (intent?: { reason: string; payload: Record<string, unknown> }) => void;
  navigateTo: (path: string, options?: { replace?: boolean }) => void;
  openCreateCommunity: (draft?: CreateCommunityIntentDraft | null) => void;
  operatorComplimentaryAccess: boolean;
  hasLoadedAccountCommerceStatus: boolean;
  loadAccountCommerceStatus: (
    session: AuthSession,
  ) => Promise<{ operator_complimentary_access?: boolean } | null>;
  hasPreparedSubscription: () => boolean;
  onSubscriptionReady: (founderSubscriptionId: string) => void;
  onAttachedCommunityReady: (community: {
    communityId: string;
    communitySlug: string;
  }) => Promise<void> | void;
  showToast: (message: string) => void;
}) {
  const [status, setStatus] = useState<BuilderPurchaseActivationStatus>(() =>
    readPendingFounderCheckout() ? "confirming_payment" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [hasPendingPurchase, setHasPendingPurchase] = useState(() =>
    Boolean(readPendingFounderCheckout()),
  );
  const [resumeNonce, setResumeNonce] = useState(0);
  const initialCheckoutReturnRef = useRef(
    parseFounderCheckoutReturn(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );
  const inFlightRef = useRef(false);
  const pollAttemptRef = useRef(0);
  const pollTimeoutRef = useRef<number | null>(null);
  const preparedSubscriptionIdRef = useRef<string | null>(null);

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const scheduleReceiptPoll = useCallback(() => {
    clearPollTimeout();
    pollAttemptRef.current += 1;
    if (pollAttemptRef.current > MAX_RECEIPT_POLL_ATTEMPTS) {
      setStatus("error");
      setError("Payment verification is taking longer than expected. Reload this page to continue safely.");
      return;
    }
    const delayMs = Math.min(5_000, 750 + pollAttemptRef.current * 350);
    pollTimeoutRef.current = window.setTimeout(() => {
      setResumeNonce((value) => value + 1);
    }, delayMs);
  }, [clearPollTimeout]);

  const prepareCommunityCreation = useCallback((founderSubscriptionId: string) => {
    if (preparedSubscriptionIdRef.current === founderSubscriptionId) return;
    preparedSubscriptionIdRef.current = founderSubscriptionId;
    params.onSubscriptionReady(founderSubscriptionId);
    setStatus("ready_to_create");
    setError(null);
    params.openCreateCommunity(null);
  }, [params.onSubscriptionReady, params.openCreateCommunity]);

  const resolveClaimedSubscription = useCallback(async (
    session: AuthSession,
    founderSubscriptionId: string,
  ): Promise<"unassigned" | "attached"> => {
    const overview = await loadCloudFounderBillingOverview({ session });
    const attached = overview.communities.find(
      (community) => community.subscription_id === founderSubscriptionId,
    );
    if (attached) {
      clearPendingFounderCheckout();
      clearPollTimeout();
      setHasPendingPurchase(false);
      setStatus("idle");
      await params.onAttachedCommunityReady({
        communityId: attached.community_id,
        communitySlug: attached.community_slug,
      });
      return "attached";
    }
    const unassigned = overview.unassigned_subscriptions.find(
      (subscription) =>
        subscription.subscription_id === founderSubscriptionId &&
        subscription.grants_setup,
    );
    if (!unassigned) throw new Error("founder_checkout_claimed_subscription_missing");
    return "unassigned";
  }, [clearPollTimeout, params.onAttachedCommunityReady]);

  const resumePendingPurchase = useCallback(async (): Promise<void> => {
    if (!params.isAuthBootstrapComplete) return;
    if (inFlightRef.current) return;
    const pending = readPendingFounderCheckout();
    if (!pending) {
      setHasPendingPurchase(false);
      return;
    }
    setHasPendingPurchase(true);
    if (!pending.session_id) {
      setStatus("error");
      setError("The checkout session is missing. Start checkout again.");
      return;
    }

    inFlightRef.current = true;
    try {
      if (pending.claim_token) {
        const receipt = await loadCloudFounderCheckoutReceiptStatus({
          sessionId: pending.session_id,
          claimToken: pending.claim_token,
        });
        if (receipt.status === "pending_payment") {
          setStatus("confirming_payment");
          setError(null);
          scheduleReceiptPoll();
          return;
        }
        if (receipt.status === "revoked" || receipt.status === "expired") {
          clearPendingFounderCheckout();
          setHasPendingPurchase(false);
          throw new Error(`founder_checkout_receipt_${receipt.status}`);
        }
      }

      if (!params.session) {
        setStatus("authentication_required");
        params.requireSignIn({
          reason: "activate_builder_purchase",
          payload: { session_id: pending.session_id },
        });
        return;
      }

      const activeSession = await params.ensureSession(params.session);
      if (!activeSession) {
        setStatus("authentication_required");
        params.requireSignIn({
          reason: "activate_builder_purchase",
          payload: { session_id: pending.session_id },
        });
        return;
      }

      if (!params.accountSetupStatus) return;
      if (!params.accountSetupStatus.completed) {
        setStatus("setup_required");
        if (window.location.pathname !== "/onboarding") {
          params.navigateTo("/onboarding");
        }
        return;
      }

      setStatus("claiming");
      setError(null);
      let founderSubscriptionId: string | null = null;
      try {
        const claimed = pending.claim_token
          ? await claimCloudFounderCheckoutReceipt({
              session: activeSession,
              sessionId: pending.session_id,
              claimToken: pending.claim_token,
            })
          : await claimCloudFounderCheckoutReceiptByVerifiedEmail({
              session: activeSession,
              sessionId: pending.session_id,
            });
        founderSubscriptionId = claimed.founder_subscription_id;
      } catch (claimError) {
        const message = claimError instanceof Error ? claimError.message : String(claimError ?? "");
        if (message.includes("founder_checkout_payment_not_verified")) {
          setStatus("confirming_payment");
          scheduleReceiptPoll();
          return;
        }
        throw claimError;
      }
      if (!founderSubscriptionId) {
        throw new Error("founder_checkout_claimed_subscription_missing");
      }
      const destination = await resolveClaimedSubscription(
        activeSession,
        founderSubscriptionId,
      );
      if (destination === "attached") return;
      clearPollTimeout();
      pollAttemptRef.current = 0;
      prepareCommunityCreation(founderSubscriptionId);
    } catch (activationError) {
      const activationMessage = activationError instanceof Error
        ? activationError.message
        : String(activationError ?? "");
      if (activationMessage.includes("founder_checkout_receipt_not_found")) {
        clearPendingFounderCheckout();
        setHasPendingPurchase(false);
      }
      const nextError = formatActivationError(activationError);
      setStatus("error");
      setError(nextError);
      params.showToast(nextError);
    } finally {
      inFlightRef.current = false;
    }
  }, [
    clearPollTimeout,
    params.accountSetupStatus,
    params.ensureSession,
    params.isAuthBootstrapComplete,
    params.navigateTo,
    params.requireSignIn,
    params.session,
    params.showToast,
    prepareCommunityCreation,
    resolveClaimedSubscription,
    scheduleReceiptPoll,
  ]);

  const startPurchase = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus("starting_checkout");
    setError(null);
    let resumeAfterUnlock = false;
    try {
      await runWithFounderCheckoutStartLock(async () => {
        const existing = readPendingFounderCheckout();
        const pending = resolveFounderCheckoutStartReceipt(existing);
        if (!pending) {
          if (existing) {
            resumeAfterUnlock = true;
            return;
          }
          throw new Error("Secure checkout could not be prepared.");
        }
        if (!pending.checkout_attempt_id || !pending.claim_token) {
          throw new Error("Secure checkout could not be prepared.");
        }
        storePendingFounderCheckout(pending);
        setHasPendingPurchase(true);
        const urls = buildFounderCheckoutReturnUrls(window.location.origin);
        const checkout = await startCloudPublicBuilderCheckout({
          checkoutAttemptId: pending.checkout_attempt_id,
          claimToken: pending.claim_token,
          successUrl: urls.successUrl,
          cancelUrl: urls.cancelUrl,
        });
        storePendingFounderCheckout(attachFounderCheckoutSession(pending, checkout.session_id));
        window.location.assign(checkout.checkout_url);
      });
      if (resumeAfterUnlock) {
        inFlightRef.current = false;
        await resumePendingPurchase();
      }
    } catch (checkoutError) {
      const nextError = formatActivationError(checkoutError);
      setStatus("error");
      setError(nextError);
      params.showToast(nextError);
    } finally {
      inFlightRef.current = false;
    }
  }, [params.showToast, resumePendingPurchase]);

  const openCommunityPurchaseFlow = useCallback((
    draft: CreateCommunityIntentDraft | null = null,
  ): void => {
    void (async () => {
      if (params.hasPreparedSubscription()) {
        params.openCreateCommunity(draft);
        return;
      }

      let isOperatorComped = params.operatorComplimentaryAccess;
      if (params.session && !params.hasLoadedAccountCommerceStatus) {
        const commerceStatus = await params.loadAccountCommerceStatus(params.session);
        if (!commerceStatus) {
          params.showToast("We could not verify your Builder access. Try again.");
          return;
        }
        isOperatorComped = commerceStatus.operator_complimentary_access === true;
      }

      if (isOperatorComped) {
        params.openCreateCommunity(draft);
        return;
      }
      await startPurchase();
    })();
  }, [
    params.hasLoadedAccountCommerceStatus,
    params.hasPreparedSubscription,
    params.loadAccountCommerceStatus,
    params.openCreateCommunity,
    params.operatorComplimentaryAccess,
    params.session,
    params.showToast,
    startPurchase,
  ]);

  const completePurchaseActivation = useCallback(() => {
    clearPendingFounderCheckout();
    clearPollTimeout();
    pollAttemptRef.current = 0;
    preparedSubscriptionIdRef.current = null;
    setHasPendingPurchase(false);
    setStatus("idle");
    setError(null);
  }, [clearPollTimeout]);

  useEffect(() => {
    // Capture the checkout return during render. Earlier shell effects may
    // canonicalize the signed-in route before this effect runs, but they must
    // not be allowed to erase a paid recovery receipt.
    const checkoutReturn = initialCheckoutReturnRef.current;
    initialCheckoutReturnRef.current = null;
    if (!checkoutReturn) return;
    if (checkoutReturn.kind === "canceled") {
      const existing = readPendingFounderCheckout();
      if (existing && !pendingFounderCheckoutMatchesSession(existing, checkoutReturn.session_id)) {
        scrubCurrentRouteSearchParams(["founder_checkout", "session_id"]);
        return;
      }
      clearPendingFounderCheckout();
      setHasPendingPurchase(false);
      setStatus("canceled");
      scrubCurrentRouteSearchParams(["founder_checkout", "session_id"]);
      return;
    }
    if (!checkoutReturn.session_id) {
      setStatus("error");
      setError("The checkout return is missing its session identifier.");
      scrubCurrentRouteSearchParams(["founder_checkout", "session_id"]);
      return;
    }
    const existing = readPendingFounderCheckout();
    const pending =
      checkoutReturn.kind === "success" &&
      existing?.claim_token &&
      (!existing.session_id || existing.session_id === checkoutReturn.session_id)
        ? attachFounderCheckoutSession(existing, checkoutReturn.session_id)
        : recoverPendingFounderCheckout({ sessionId: checkoutReturn.session_id });
    storePendingFounderCheckout(pending);
    setHasPendingPurchase(true);
    setStatus("confirming_payment");
    scrubCurrentRouteSearchParams(["founder_checkout", "session_id"]);
    setResumeNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    void resumePendingPurchase();
  }, [params.accountSetupStatus?.completed, params.session, resumeNonce, resumePendingPurchase]);

  useEffect(() => () => clearPollTimeout(), [clearPollTimeout]);

  return {
    status,
    error,
    hasPendingPurchase,
    isStartingPurchase: status === "starting_checkout",
    startPurchase,
    openCommunityPurchaseFlow,
    resumePendingPurchase,
    completePurchaseActivation,
  };
}
