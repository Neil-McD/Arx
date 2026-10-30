import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  classifyPublicCommunityJoinError, clearPendingPublicJoin, getErrorMessage, joinPublicCommunityRpc, storePendingPublicJoin, } from "../../../../shared/pay_first";
import {
  storeAuthResumeState,
  type PendingAuthIntentInput,
} from "../../../../shared/authResumeState";
import type { AccountSetupResolution } from "../../../../shared/accountSetup";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";

import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import {
  cancelCloudMyJoinRequestBySlug,
  fetchCloudPublicCommunityMemoryOverview,
  fetchCloudPublicFunnelStats,
  recordCloudPublicFunnelVisit,
  resolveCloudPublicFunnel,
  startCloudPublicFunnelCheckout,
} from "../../../../shared/cloudPublicFunnelGateway";
import { communityOfferUpgradeErrorMessage } from "../../../../shared/cloudCommunityOffersGateway";
import { preloadImageUrls } from "../../../../shared/preloadImageUrls";
import { applyShellVariantToPublicPath, readShellVariantFromPathname } from "../../../../shared/webAppRouteState";
import type { AuthSession } from "../auth";
import type { CommunityBillingPeriod } from "../../../../shared/communityTypes";

type UseWebPublicFunnelActionsArgs<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
    avatar_url?: string | null;
    banner_url?: string | null;
    funnel?: {
      hero_media_kind?: unknown;
      hero_media_url?: string | null;
    } | null;
  },
  PublicPlanT extends { billing_period: CommunityBillingPeriod },
  CommunityAccessT extends CommunityAccessRow,
> = {
  getSession: () => AuthSession | null;
  getCurrentPublicCommunitySlug: () => string | null;
  getCurrentPublicCommunityAccess: () => CommunityAccessT | null;
  session: AuthSession | null;
  ensureSession?: (session: AuthSession | null) => Promise<AuthSession | null>;
  resolveAccountSetupStatus: (
    session: AuthSession,
  ) => Promise<AccountSetupResolution>;
  onAccountSetupRequired: () => void;
  requireSignIn: (intentInput: PendingAuthIntentInput) => void;
  loadCommunities: (session: AuthSession) => Promise<void>;
  openCommunityWorkspace: (opts: { communityId: string; communitySlug?: string | null }) => void;
  onJoinRequestSent?: (params: { communityId: string | null; communitySlug: string | null }) => void;

  setIsJoiningPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setIsCancellingPublicCommunityJoinRequest: Dispatch<SetStateAction<boolean>>;
  setPublicJoinError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunity: Dispatch<SetStateAction<PublicCommunityT | null>>;
  setPublicCommunityAccess: Dispatch<SetStateAction<CommunityAccessT | null>>;
  setPublicCommunityAccessResolutionKey: Dispatch<SetStateAction<string | null>>;

  setIsLoadingPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setPublicCommunityError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunityPlans: Dispatch<SetStateAction<PublicPlanT[]>>;

  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  setCheckoutStatus: Dispatch<SetStateAction<"idle" | "loading" | "pending" | "succeeded" | "error">>;
  navigateToUrl: (url: string) => void;
};

type CommunityAccessRow = {
  community_id: string;
  relation?: "visitor" | "pending" | "member" | "moderator" | "admin" | "owner" | null;
  can_enter_community?: boolean;
  is_owner: boolean;
  join_request_status?: "pending" | "denied" | null;
  join_request_reapply_at?: string | null;
  can_manage_branding?: boolean;
  can_manage_publishing?: boolean;
  can_manage_pricing?: boolean;
};

// The sales page editor shows the page in a frame on Polynet itself; that
// preview is the owner looking, not a visit, so it isn't counted.
function isFramedByPolynet(): boolean {
  if (typeof window === "undefined" || window.parent === window) return false;
  try {
    return window.parent.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function useWebPublicFunnelActions<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
    avatar_url?: string | null;
    banner_url?: string | null;
    funnel?: {
      hero_media_kind?: unknown;
      hero_media_url?: string | null;
    } | null;
  },
  PublicPlanT extends { billing_period: CommunityBillingPeriod },
  CommunityAccessT extends CommunityAccessRow,
>(
  args: UseWebPublicFunnelActionsArgs<
    PublicCommunityT,
    PublicPlanT,
    CommunityAccessT
  >,
) {
  const argsRef = useRef(args);

  useEffect(() => {
    argsRef.current = args;
  }, [args]);

  const applyApprovalJoinState = useCallback(
    (opts: {
      status: "pending" | "denied";
      communityId?: string | null;
      communitySlug?: string | null;
      reapplyAt?: string | null;
    }) => {
      const current = argsRef.current;
      if (
        opts.communitySlug &&
        current.getCurrentPublicCommunitySlug() !== opts.communitySlug
      ) return;
      current.setPublicJoinError(null);
      current.setPublicCommunityAccess((previous) => {
        if (!previous) return previous;
        if (opts.communityId && previous.community_id !== opts.communityId) {
          return previous;
        }
        return {
          ...previous,
          relation: opts.status === "pending" ? "pending" : "visitor",
          join_request_status: opts.status,
          join_request_reapply_at: opts.reapplyAt ?? null,
        } as CommunityAccessT;
      });
      current.setPublicCommunity((prev) =>
        prev
          ? ({
              ...prev,
              entry_policy: "approval",
            } as PublicCommunityT)
          : prev,
      );
    },
    [],
  );

  const reconcileJoinOutcomeBySlug = useCallback(
    async (communitySlug: string, session: AuthSession): Promise<"entered" | "pending" | "denied" | "none"> => {
      const trimmedSlug = communitySlug.trim();
      if (!trimmedSlug) return "none";

      let access: CommunityAccessT | null;
      try {
        access = await fetchCloudMyCommunityAccessBySlug<AuthSession, CommunityAccessT>({
          session,
          communitySlug: trimmedSlug,
        });
      } catch {
        return "none";
      }
      const current = argsRef.current;
      if (current.getCurrentPublicCommunitySlug() !== trimmedSlug || !access) {
        return "none";
      }
      current.setPublicCommunityAccess(access);
      if ((access.can_enter_community || access.is_owner) && access.community_id) {
        clearPendingPublicJoin();
        current.setPublicJoinError(null);
        current.openCommunityWorkspace({
          communityId: access.community_id,
          communitySlug: trimmedSlug,
        });
        await current.loadCommunities(session);
        return "entered";
      }
      const status = access.join_request_status;
      if (status !== "pending" && status !== "denied") return "none";
      clearPendingPublicJoin();
      current.setPublicJoinError(null);
      current.setPublicCommunity((previous) =>
        previous
          ? ({ ...previous, entry_policy: "approval" } as PublicCommunityT)
          : previous,
      );
      return status;
    },
    [],
  );

  const joinPublicCommunity = useCallback(
    async (opts: { communityId?: string; communitySlug?: string | null }): Promise<boolean> => {
      const trimmedId = (opts.communityId ?? "").trim();
      const trimmedSlug = (opts.communitySlug ?? "").trim();
      if (!trimmedId && !trimmedSlug) return false;

      const current = argsRef.current;
      const rawSession = current.getSession();
      const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
      if (!session) {
        storePendingPublicJoin(trimmedSlug || trimmedId);
        current.requireSignIn({
          reason: "join_public_community",
          payload: {
            community_id: trimmedId || null,
            community_slug: trimmedSlug || null,
          },
        });
        return false;
      }

      const accountSetup = await current.resolveAccountSetupStatus(session);
      if (accountSetup.status === "unauthenticated") {
        storePendingPublicJoin(trimmedSlug || trimmedId);
        current.requireSignIn({
          reason: "join_public_community",
          payload: {
            community_id: trimmedId || null,
            community_slug: trimmedSlug || null,
          },
        });
        return false;
      }
      if (accountSetup.status === "unavailable") {
        current.setPublicJoinError(accountSetup.error);
        return false;
      }
      if (!accountSetup.accountSetup.completed) {
        storePendingPublicJoin(trimmedSlug || trimmedId);
        storeAuthResumeState({
          intent: {
            reason: "join_public_community",
            payload: {
              community_id: trimmedId || null,
              community_slug: trimmedSlug || null,
            },
          },
        });
        current.onAccountSetupRequired();
        return false;
      }

      current.setIsJoiningPublicCommunity(true);
      current.setPublicJoinError(null);
      try {
        const joinResult = await joinPublicCommunityRpc({
          session,
          communityId: trimmedId || undefined,
          communitySlug: trimmedSlug || undefined,
        });
        clearPendingPublicJoin();
        if (
          trimmedSlug &&
          current.getCurrentPublicCommunitySlug() !== trimmedSlug
        ) return false;

        if (joinResult.outcome === "joined") {
          current.openCommunityWorkspace({
            communityId: joinResult.community_id,
            communitySlug: trimmedSlug || null,
          });
          await current.loadCommunities(session);
          return true;
        }
        if (joinResult.outcome === "approval_pending") {
          applyApprovalJoinState({
            status: "pending",
            communityId: joinResult.community_id,
            communitySlug: trimmedSlug || null,
          });
          current.onJoinRequestSent?.({
            communityId: joinResult.community_id ?? null,
            communitySlug: trimmedSlug || null,
          });
          if (trimmedSlug) {
            await reconcileJoinOutcomeBySlug(trimmedSlug, session);
          }
          return true;
        }
        if (joinResult.outcome === "approval_denied") {
          applyApprovalJoinState({
            status: "denied",
            communityId: joinResult.community_id,
            communitySlug: trimmedSlug || null,
            reapplyAt: joinResult.reapply_at ?? null,
          });
          if (trimmedSlug) {
            await reconcileJoinOutcomeBySlug(trimmedSlug, session);
          }
          return true;
        }
        if (joinResult.outcome === "paid_plan_required") {
          current.setPublicJoinError("This community now requires a paid plan. Select a plan to continue.");
          current.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "paid_subscription",
                } as PublicCommunityT)
              : prev,
          );
          return true;
        }
        return false;
      } catch (error) {
        const message = getErrorMessage(error, "Failed to join community.");
        const kind = classifyPublicCommunityJoinError(error);
        if (kind === "approval_pending" || kind === "approval_denied") {
          clearPendingPublicJoin();
          applyApprovalJoinState({
            status: kind === "approval_denied" ? "denied" : "pending",
            communityId: trimmedId || null,
            communitySlug: trimmedSlug || null,
          });
          return true;
        }
        if (kind === "paid_plan_required") {
          clearPendingPublicJoin();
          current.setPublicJoinError("This community now requires a paid plan. Select a plan to continue.");
          current.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "paid_subscription",
                } as PublicCommunityT)
              : prev,
          );
          return true;
        }
        if (trimmedSlug) {
          const reconciled = await reconcileJoinOutcomeBySlug(trimmedSlug, session);
          if (reconciled !== "none") {
            return true;
          }
        }
        clearPendingPublicJoin();
        current.setPublicJoinError(message);
        return false;
      } finally {
        current.setIsJoiningPublicCommunity(false);
      }
    },
    [applyApprovalJoinState, reconcileJoinOutcomeBySlug],
  );

  const cancelMyPendingJoinRequest = useCallback(
    async (communitySlug: string): Promise<void> => {
      const trimmedSlug = communitySlug.trim();
      if (!trimmedSlug) return;
      const current = argsRef.current;
      const rawSession = current.getSession();
      const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
      if (!session) return;

      current.setIsCancellingPublicCommunityJoinRequest(true);
      current.setPublicJoinError(null);
      try {
        const result = await cancelCloudMyJoinRequestBySlug({
          session,
          communitySlug: trimmedSlug,
        });
        if (result?.outcome === "canceled" || result?.outcome === "none") {
          current.setPublicCommunityAccess((previous) =>
            previous
              ? ({
                  ...previous,
                  relation: "visitor",
                  join_request_status: null,
                  join_request_reapply_at: null,
                } as CommunityAccessT)
              : previous,
          );
        }
      } catch (error) {
        const message = getErrorMessage(error, "Failed to cancel join request.");
        current.setPublicJoinError(message);
      } finally {
        current.setIsCancellingPublicCommunityJoinRequest(false);
      }
    },
    [],
  );

  const refreshPendingPublicCommunityAccess = useCallback(
    async (communitySlug: string): Promise<void> => {
      const slug = communitySlug.trim();
      const current = argsRef.current;
      if (!slug || current.getCurrentPublicCommunitySlug() !== slug
        || current.getCurrentPublicCommunityAccess()?.join_request_status !== "pending") return;

      try {
        const rawSession = current.getSession();
        const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
        const subject = session ? resolveAuthSubject(session) : null;
        if (!session || !subject) return;
        const access = await fetchCloudMyCommunityAccessBySlug<AuthSession, CommunityAccessT>({
          session,
          communitySlug: slug,
        });
        const latest = argsRef.current;
        if (!access || latest.getCurrentPublicCommunitySlug() !== slug
          || resolveAuthSubject(latest.getSession()) !== subject) return;
        // A canceled request, account switch, or route change must not be
        // reverted by a response that started while the request was pending.
        latest.setPublicCommunityAccess((previous) =>
          previous?.join_request_status === "pending" && previous.community_id === access.community_id
            ? access
            : previous,
        );
      } catch {
        // Keep the last verified state on transient failures; the next poll or
        // return to the tab will retry without clearing the funnel UI.
      }
    },
    [],
  );

  const loadPublicCommunity = useCallback(
    async (slug: string, opts?: { recordVisit?: boolean }): Promise<void> => {
      const requestedSlug = slug.trim();
      if (!requestedSlug) return;
      const current = argsRef.current;
      const currentSlug = current.getCurrentPublicCommunitySlug();
      const isSameSlugRefresh = currentSlug === requestedSlug;

      current.setIsLoadingPublicCommunity(true);
      current.setPublicCommunityError(null);
      current.setPublicJoinError(null);
      current.setPublicCommunityAccessResolutionKey(null);
      current.setPublicCommunityAccess(null);
      if (!isSameSlugRefresh) {
        current.setPublicCommunity(null);
        current.setPublicCommunityPlans([]);
      }
      try {
        const payload = await resolveCloudPublicFunnel<AuthSession, PublicCommunityT, PublicPlanT>({
          communitySlug: requestedSlug,
        });
        if (!payload?.community?.slug) throw new Error("Community not found.");

        const revealImageUrls = [
          payload.community.avatar_url ?? null,
          payload.community.banner_url ?? null,
          (payload.community.funnel?.hero_media_kind ?? null) === "image"
            ? (payload.community.funnel?.hero_media_url ?? null)
            : null,
        ];
        void preloadImageUrls(revealImageUrls, {
          maxUrls: 8,
          timeoutMs: 1500,
          fetchPriority: "high",
        });

        const loadedCommunity = payload.community;
        const resolvedSlug = loadedCommunity.slug;
        /* Merge into the same community, never replace it: the memory graph and
           stats are folded in by the async fetches below, and a bare replace on
           any re-fire would drop them for a beat — that is the panel flicker.
           (Same additive pattern the stats/memory merges use.) */
        current.setPublicCommunity((prev) =>
          prev && prev.slug === resolvedSlug
            ? ({
                ...prev,
                ...loadedCommunity,
                visibility: toCanonicalCommunityVisibility(loadedCommunity.visibility, "unlisted"),
              } as PublicCommunityT)
            : ({
                ...loadedCommunity,
                visibility: toCanonicalCommunityVisibility(loadedCommunity.visibility, "unlisted"),
              } as PublicCommunityT),
        );
        current.setPublicCommunityPlans(payload.active_plan ? [payload.active_plan] : []);
        current.setIsLoadingPublicCommunity(false);

        if (opts?.recordVisit !== false && !isFramedByPolynet()) {
          void recordCloudPublicFunnelVisit<AuthSession>({
            session: current.getSession(),
            communitySlug: resolvedSlug,
          }).catch((error) => {
            console.warn("Failed to record public funnel visit:", error);
          });
        }

        void fetchCloudPublicFunnelStats<AuthSession, Record<string, unknown>>({
          communitySlug: resolvedSlug,
        })
          .then((statsPayload) => {
            const stats = statsPayload?.community as Partial<PublicCommunityT> | undefined;
            if (!stats) return;
            current.setPublicCommunity((prev) =>
              prev && prev.slug === resolvedSlug
                ? ({ ...prev, ...stats } as PublicCommunityT)
                : prev,
            );
          })
          .catch((error) => {
            console.warn("Failed to resolve public community stats:", error);
          });

        void fetchCloudPublicCommunityMemoryOverview<AuthSession, Record<string, unknown>>({
          communitySlug: resolvedSlug,
        })
          .then((overviewPayload) => {
            if (!overviewPayload?.ok || !overviewPayload.overview) return;
            current.setPublicCommunity((prev) =>
              prev && prev.slug === resolvedSlug
                ? ({ ...prev, memory_overview: overviewPayload.overview } as PublicCommunityT)
                : prev,
            );
          })
          .catch((error) => {
            console.warn("Failed to resolve public community memory overview:", error);
          });

        void (async () => {
          const rawSession = current.getSession();
          const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
          const accessSubject = session ? resolveAuthSubject(session) : null;
          if (session) {
            try {
              const access = await fetchCloudMyCommunityAccessBySlug<AuthSession, CommunityAccessT>({
                session,
                communitySlug: resolvedSlug,
              });
              if (
                current.getCurrentPublicCommunitySlug() !== resolvedSlug ||
                resolveAuthSubject(current.getSession()) !== accessSubject
              ) return;
              current.setPublicCommunityAccess(access);
            } catch (error) {
              if (
                current.getCurrentPublicCommunitySlug() !== resolvedSlug ||
                resolveAuthSubject(current.getSession()) !== accessSubject
              ) return;
              current.setPublicCommunityAccess(null);
              current.setPublicCommunityError(
                "You are signed in, but Polynet could not verify your community access. Refresh and try again.",
              );
              console.warn("Failed to verify signed-in community access:", error);
            }
          } else if (current.getCurrentPublicCommunitySlug() === resolvedSlug) {
            current.setPublicCommunityAccess(null);
          }

          if (current.getCurrentPublicCommunitySlug() === resolvedSlug) {
            current.setPublicCommunityAccessResolutionKey(
              accessSubject ? `${accessSubject}:${resolvedSlug}` : null,
            );
          }
        })();
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load community.";
        current.setPublicCommunityError(message);
        current.setIsLoadingPublicCommunity(false);
        const currentSubject = resolveAuthSubject(current.getSession());
        current.setPublicCommunityAccessResolutionKey(
          currentSubject ? `${currentSubject}:${requestedSlug}` : null,
        );
      }
    },
    [],
  );

  const startCheckoutForPlan = useCallback(
    async (communitySlug: string, billingPeriod: CommunityBillingPeriod, cancelPath: string, offerKey?: string | null): Promise<void> => {
      const current = argsRef.current;
      current.setCheckoutStatus("loading");
      current.setCheckoutError(null);
      try {
        const origin = window.location.origin.replace(/\/+$/, "");
        const shellVariant = readShellVariantFromPathname(window.location.pathname || "/");
        const successPath = applyShellVariantToPublicPath(
          "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
          shellVariant,
        );
        const successUrl = `${origin}${successPath}`;
        const cancelUrl = `${origin}${cancelPath}`;
        const rawSession = current.getSession();
        const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
        if (!session) {
          current.requireSignIn({
            reason: "join_public_community",
            payload: {
              community_id: null,
              community_slug: communitySlug,
            },
          });
          current.setCheckoutStatus("idle");
          return;
        }
        const data = await startCloudPublicFunnelCheckout<AuthSession>({
          session,
          communitySlug,
          billingPeriod,
          successUrl,
          cancelUrl,
          offerKey,
        });
        const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url : "";
        if (!checkoutUrl) throw new Error("Missing checkout_url.");
        current.navigateToUrl(checkoutUrl);
      } catch (error) {
        const rawMessage =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to start checkout.";
        const message =
          rawMessage.includes("community_checkout_unavailable")
            ? "Checkout is temporarily unavailable for this community."
            : rawMessage.includes("offer_") ? communityOfferUpgradeErrorMessage(rawMessage)
            : rawMessage;
        current.setCheckoutError(message);
        current.setCheckoutStatus("error");
      }
    },
    [],
  );

  return {
    cancelMyPendingJoinRequest,
    joinPublicCommunity,
    loadPublicCommunity,
    refreshPendingPublicCommunityAccess,
    startCheckoutForPlan,
  };
}
