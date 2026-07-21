import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { resolveAuthSubject } from "../../../../shared/authSession";
import {
  startCloudPublicFunnelCheckout,
} from "../../../../shared/cloudPublicFunnelGateway";
import { normalizeCommunitySlugIdentity } from "../../../../shared/communitySlug";
import type { CommunityBillingPeriod } from "../../../../shared/communityTypes";
import { applyShellVariantToPublicPath, readShellVariantFromPathname } from "../../../../shared/webAppRouteState";
import { getErrorMessage } from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/authResumeState";
import type { AuthSession } from "../auth";
import {
  executePublicCommunityCheckoutStartAction,
  isPublicCommunityCheckoutStartSnapshotCurrent,
  type PublicCommunityCheckoutStartSnapshot,
} from "../publicCommunityCheckoutStartAction";

type CheckoutRetry = Pick<
  PublicCommunityCheckoutStartSnapshot,
  "communitySlug" | "billingPeriod" | "authSubject" | "checkoutAttemptId"
>;

type Args = {
  getSession: () => AuthSession | null;
  ensureSession?: (session: AuthSession | null) => Promise<AuthSession | null>;
  getCurrentPublicFunnelSlug: () => string | null;
  getCurrentBillingPeriod: () => CommunityBillingPeriod | null;
  getCurrentAuthSubject: () => string | null;
  getCurrentRouteAuthority: () => string;
  requireSignIn: (intentInput: PendingAuthIntentInput) => void;
  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  setCheckoutStatus: Dispatch<
    SetStateAction<"idle" | "loading" | "pending" | "succeeded" | "error">
  >;
  navigateToUrl: (url: string) => void;
};

function createCheckoutAttemptId(): string {
  return `checkout_${crypto.randomUUID().replaceAll("-", "")}`;
}

function toPublicCheckoutErrorMessage(message: string): string {
  if (message.includes("community_checkout_unavailable")) {
    return "Checkout is temporarily unavailable for this community.";
  }
  if (message.includes("community_access_already_active")) {
    return "You already have access to this community.";
  }
  if (message.includes("checkout_attempt_complete")) {
    return "This checkout was already completed. Refresh to verify your access.";
  }
  if (message.includes("checkout_attempt_expired")) {
    return "This checkout attempt expired. Try again to start a new checkout.";
  }
  return message;
}

export function useWebPublicCheckoutStart(args: Args) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const generationRef = useRef(0);
  const activeRef = useRef<PublicCommunityCheckoutStartSnapshot | null>(null);
  const retryRef = useRef<CheckoutRetry | null>(null);
  const renderAuthority = {
    communitySlug: normalizeCommunitySlugIdentity(
      args.getCurrentPublicFunnelSlug(),
    ),
    billingPeriod: args.getCurrentBillingPeriod(),
    authSubject: String(args.getCurrentAuthSubject() ?? "").trim(),
    routeAuthority: args.getCurrentRouteAuthority(),
  };
  const renderAuthorityKey = `${renderAuthority.communitySlug}\u0000${
    renderAuthority.authSubject
  }\u0000${String(renderAuthority.billingPeriod ?? "")}\u0000${
    renderAuthority.routeAuthority
  }`;
  const committedAuthorityKeyRef = useRef(renderAuthorityKey);
  const committedAuthorityRef = useRef(renderAuthority);

  const snapshotIsCurrent = useCallback(
    (snapshot: PublicCommunityCheckoutStartSnapshot): boolean =>
      isPublicCommunityCheckoutStartSnapshotCurrent({
        snapshot,
        current: {
          generation: generationRef.current,
          ...committedAuthorityRef.current,
        },
      }),
    [],
  );

  useEffect(() => {
    if (committedAuthorityKeyRef.current === renderAuthorityKey) return;
    committedAuthorityKeyRef.current = renderAuthorityKey;
    committedAuthorityRef.current = renderAuthority;
    if (activeRef.current) generationRef.current += 1;
    activeRef.current = null;
    retryRef.current = null;
    argsRef.current.setCheckoutError(null);
    argsRef.current.setCheckoutStatus("idle");
  }, [renderAuthorityKey]);

  const startCheckoutForPlan = useCallback(
    async (
      rawCommunitySlug: string,
      billingPeriod: CommunityBillingPeriod,
      cancelPath: string,
    ): Promise<void> => {
      const current = argsRef.current;
      const communitySlug = normalizeCommunitySlugIdentity(rawCommunitySlug);
      const authSubject = String(current.getCurrentAuthSubject() ?? "").trim();
      const existingActive = activeRef.current;
      if (existingActive && snapshotIsCurrent(existingActive)) return;
      if (!communitySlug || !authSubject) {
        current.requireSignIn({
          reason: "join_public_community",
          payload: { community_slug: communitySlug || rawCommunitySlug },
        });
        current.setCheckoutStatus("idle");
        return;
      }
      const retry = retryRef.current;
      const checkoutAttemptId =
        retry &&
        retry.communitySlug === communitySlug &&
        retry.billingPeriod === billingPeriod &&
        retry.authSubject === authSubject
          ? retry.checkoutAttemptId
          : createCheckoutAttemptId();
      const snapshot: PublicCommunityCheckoutStartSnapshot = {
        generation: ++generationRef.current,
        communitySlug,
        billingPeriod,
        authSubject,
        routeAuthority: current.getCurrentRouteAuthority(),
        checkoutAttemptId,
      };
      if (!snapshotIsCurrent(snapshot)) return;
      activeRef.current = snapshot;
      retryRef.current = snapshot;
      current.setCheckoutStatus("loading");
      current.setCheckoutError(null);

      let outcome: "redirected" | "stale" | "failed" | "idle" = "idle";
      let failureMessage = "";
      try {
        const rawSession = current.getSession();
        const session = current.ensureSession
          ? await current.ensureSession(rawSession)
          : rawSession;
        if (!snapshotIsCurrent(snapshot)) {
          outcome = "stale";
          return;
        }
        if (!session || resolveAuthSubject(session) !== snapshot.authSubject) {
          current.requireSignIn({
            reason: "join_public_community",
            payload: { community_slug: communitySlug },
          });
          outcome = "idle";
          return;
        }
        const origin = window.location.origin.replace(/\/+$/, "");
        const shellVariant = readShellVariantFromPathname(window.location.pathname || "/");
        const successPath = applyShellVariantToPublicPath(
          "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
          shellVariant,
        );
        const result = await executePublicCommunityCheckoutStartAction({
          runCheckout: () =>
            startCloudPublicFunnelCheckout<AuthSession>({
              session,
              communitySlug,
              billingPeriod,
              successUrl: `${origin}${successPath}`,
              cancelUrl: `${origin}${cancelPath}`,
              checkoutAttemptId,
            }),
          isCurrent: () => snapshotIsCurrent(snapshot),
          navigateToUrl: current.navigateToUrl,
          setError: current.setCheckoutError,
          getErrorMessage: (error, fallback) =>
            toPublicCheckoutErrorMessage(getErrorMessage(error, fallback)),
        });
        outcome = result.outcome;
        if (result.outcome === "failed") failureMessage = result.message;
      } catch (error) {
        if (snapshotIsCurrent(snapshot)) {
          failureMessage = toPublicCheckoutErrorMessage(
            getErrorMessage(error, "Failed to start checkout."),
          );
          current.setCheckoutError(failureMessage);
          outcome = "failed";
        } else {
          outcome = "stale";
        }
      } finally {
        if (activeRef.current?.generation !== snapshot.generation) return;
        activeRef.current = null;
        if (outcome === "failed") {
          current.setCheckoutStatus("error");
          if (
            failureMessage.includes("expired") ||
            failureMessage.includes("already completed")
          ) {
            retryRef.current = null;
          }
        } else if (outcome === "idle") {
          current.setCheckoutStatus("idle");
        }
      }
    },
    [snapshotIsCurrent],
  );

  return { startCheckoutForPlan };
}
