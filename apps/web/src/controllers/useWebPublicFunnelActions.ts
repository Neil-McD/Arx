import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  classifyPublicCommunityJoinError, clearPendingPublicJoin, getBrandosAidForCommunitySlug, getErrorMessage, joinPublicCommunityRpc, readPendingPublicJoinBrandosAid, storePendingPublicJoin, } from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/cloudAuthIntent";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";

import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import {
  cancelCloudMyJoinRequestBySlug,
  fetchCloudMyJoinRequestBySlug,
  resolveCloudPublicFunnel,
  startCloudPublicFunnelCheckout,
} from "../../../../shared/cloudPublicFunnelGateway";
import type { CloudSession } from "../cloudAuth";
import { deriveCommunityJoinMode } from "../communityJoinPolicy";
import type { CommunityBillingPeriod } from "../../../../shared/communityTypes";

type UseWebPublicFunnelActionsArgs<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
  },
  PublicPlanT extends { billing_period: CommunityBillingPeriod },
  MyCommunityJoinRequestT extends { community_id: string; status: string },
> = {
  getSession: () => CloudSession | null;
  getCurrentPublicCommunitySlug: () => string | null;
  session: CloudSession | null;
  ensureSession?: (session: CloudSession | null) => Promise<CloudSession | null>;
  openAuthGate: (intentInput: PendingAuthIntentInput) => void;
  loadCommunities: (session: CloudSession) => Promise<void>;
  openCommunityWorkspace: (opts: { communityId: string; communitySlug?: string | null }) => void;
  isUuid: (value: string) => boolean;

  setIsJoiningPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setIsCancellingPublicCommunityJoinRequest: Dispatch<SetStateAction<boolean>>;
  setPublicJoinError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunity: Dispatch<SetStateAction<PublicCommunityT | null>>;
  setPublicCommunityAccess: Dispatch<SetStateAction<CommunityAccessRow | null>>;

  setIsLoadingMyPublicCommunityJoinRequest: Dispatch<SetStateAction<boolean>>;
  setMyPublicCommunityJoinRequest: Dispatch<SetStateAction<MyCommunityJoinRequestT | null>>;

  setIsLoadingPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setPublicCommunityError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunityPlans: Dispatch<SetStateAction<PublicPlanT[]>>;

  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  setCheckoutStatus: Dispatch<SetStateAction<"idle" | "loading" | "pending" | "succeeded" | "error">>;
  navigateToUrl: (url: string) => void;
};

type CommunityAccessRow = { community_id: string; can_enter_community?: boolean; is_owner: boolean };

export function useWebPublicFunnelActions<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
  },
  PublicPlanT extends { billing_period: CommunityBillingPeriod },
  MyCommunityJoinRequestT extends { community_id: string; status: string },
>(args: UseWebPublicFunnelActionsArgs<PublicCommunityT, PublicPlanT, MyCommunityJoinRequestT>) {
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
      deniedUntil?: string | null;
    }) => {
      const current = argsRef.current;
      current.setPublicJoinError(null);
      current.setMyPublicCommunityJoinRequest({
        community_id: (opts.communityId ?? opts.communitySlug ?? "__pending__").trim() || "__pending__",
        status: opts.status,
        updated_at: new Date().toISOString(),
        reapply_at: opts.reapplyAt ?? null,
        denied_until: opts.deniedUntil ?? opts.reapplyAt ?? null,
      } as MyCommunityJoinRequestT);
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
    async (communitySlug: string, session: CloudSession): Promise<"entered" | "pending" | "denied" | "none"> => {
      const trimmedSlug = communitySlug.trim();
      if (!trimmedSlug) return "none";

      const [accessResult, joinRequestResult] = await Promise.allSettled([
        fetchCloudMyCommunityAccessBySlug<CloudSession, CommunityAccessRow>({
          session,
          communitySlug: trimmedSlug,
        }),
        fetchCloudMyJoinRequestBySlug<CloudSession, MyCommunityJoinRequestT>({
          session,
          communitySlug: trimmedSlug,
        }),
      ]);

      if (accessResult.status === "fulfilled") {
        const access = accessResult.value;
        if (access && (access.can_enter_community || access.is_owner) && access.community_id) {
          clearPendingPublicJoin();
          const current = argsRef.current;
          current.setPublicCommunityAccess(access);
          current.openCommunityWorkspace({
            communityId: access.community_id,
            communitySlug: trimmedSlug,
          });
          await current.loadCommunities(session);
          return "entered";
        }
      }

      if (joinRequestResult.status === "fulfilled") {
        const joinRequest = joinRequestResult.value;
        const status = String(joinRequest?.status ?? "").trim().toLowerCase();
        if (status === "pending") {
          clearPendingPublicJoin();
          const current = argsRef.current;
          current.setPublicJoinError(null);
          current.setMyPublicCommunityJoinRequest(joinRequest);
          current.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "approval",
                } as PublicCommunityT)
              : prev,
          );
          return "pending";
        }
        if (status === "denied") {
          clearPendingPublicJoin();
          const current = argsRef.current;
          current.setPublicJoinError(null);
          current.setMyPublicCommunityJoinRequest(joinRequest);
          current.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "approval",
                } as PublicCommunityT)
              : prev,
          );
          return "denied";
        }
      }
      return "none";
    },
    [],
  );

  const loadMyJoinRequestBySlug = useCallback(
    async (communitySlug: string, session: CloudSession): Promise<void> => {
      const trimmed = communitySlug.trim();
      if (!trimmed) return;
      const current = argsRef.current;
      current.setIsLoadingMyPublicCommunityJoinRequest(true);
      try {
        const row = await fetchCloudMyJoinRequestBySlug<CloudSession, MyCommunityJoinRequestT>({
          session,
          communitySlug: trimmed,
        });
        current.setMyPublicCommunityJoinRequest(row);
      } catch (error) {
        console.warn("Failed to load join request:", error);
      } finally {
        current.setIsLoadingMyPublicCommunityJoinRequest(false);
      }
    },
    [],
  );

  const joinPublicCommunity = useCallback(
    async (opts: { communityId?: string; communitySlug?: string | null }): Promise<void> => {
      const trimmedId = (opts.communityId ?? "").trim();
      const trimmedSlug = (opts.communitySlug ?? "").trim();
      if (!trimmedId && !trimmedSlug) return;

      const brandosAid = trimmedSlug ? getBrandosAidForCommunitySlug(trimmedSlug) : null;

      const current = argsRef.current;
      const rawSession = current.getSession();
      const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
      if (!session) {
        storePendingPublicJoin(trimmedSlug || trimmedId, brandosAid);
        current.openAuthGate({
          reason: "join_public_community",
          payload: {
            community_id: trimmedId || null,
            community_slug: trimmedSlug || null,
            brandos_aid: brandosAid,
          },
        });
        return;
      }

      current.setIsJoiningPublicCommunity(true);
      current.setPublicJoinError(null);
      try {
        const pendingBrandosAid = readPendingPublicJoinBrandosAid();
        const resolvedBrandosAid =
          (brandosAid && current.isUuid(brandosAid) ? brandosAid : null) ||
          (pendingBrandosAid && current.isUuid(pendingBrandosAid) ? pendingBrandosAid : null);

        const joinResult = await joinPublicCommunityRpc({
          session,
          communityId: trimmedId || undefined,
          communitySlug: trimmedSlug || undefined,
          brandosAid: resolvedBrandosAid,
        });
        clearPendingPublicJoin();

        if (joinResult.outcome === "joined") {
          current.openCommunityWorkspace({
            communityId: joinResult.community_id,
            communitySlug: trimmedSlug || null,
          });
          await current.loadCommunities(session);
          return;
        }
        if (joinResult.outcome === "approval_pending") {
          applyApprovalJoinState({
            status: "pending",
            communityId: joinResult.community_id,
            communitySlug: trimmedSlug || null,
          });
          return;
        }
        if (joinResult.outcome === "approval_denied") {
          applyApprovalJoinState({
            status: "denied",
            communityId: joinResult.community_id,
            communitySlug: trimmedSlug || null,
            reapplyAt: joinResult.reapply_at ?? null,
          });
          return;
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
          return;
        }
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
          return;
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
          return;
        }
        if (trimmedSlug) {
          const reconciled = await reconcileJoinOutcomeBySlug(trimmedSlug, session);
          if (reconciled !== "none") {
            return;
          }
        }
        clearPendingPublicJoin();
        current.setPublicJoinError(message);
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
          current.setMyPublicCommunityJoinRequest(null);
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

  const loadPublicCommunity = useCallback(
    async (slug: string): Promise<void> => {
      const requestedSlug = slug.trim();
      if (!requestedSlug) return;
      const current = argsRef.current;
      const currentSlug = current.getCurrentPublicCommunitySlug();
      const isSameSlugRefresh = currentSlug === requestedSlug;

      current.setIsLoadingPublicCommunity(true);
      current.setPublicCommunityError(null);
      if (!isSameSlugRefresh) {
        current.setPublicJoinError(null);
        current.setPublicCommunity(null);
        current.setPublicCommunityPlans([]);
        current.setMyPublicCommunityJoinRequest(null);
        current.setPublicCommunityAccess(null);
      }
      try {
        const payload = await resolveCloudPublicFunnel<CloudSession, PublicCommunityT, PublicPlanT>({
          communitySlug: requestedSlug,
        });
        if (!payload?.community?.slug) throw new Error("Community not found.");

        current.setPublicCommunity({
          ...payload.community,
          visibility: toCanonicalCommunityVisibility(payload.community.visibility, "unlisted"),
        } as PublicCommunityT);
        current.setPublicCommunityPlans(payload.active_plan ? [payload.active_plan] : []);

        const rawSession = current.getSession();
        const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
        if (session) {
          try {
            const access = await fetchCloudMyCommunityAccessBySlug<CloudSession, CommunityAccessRow>({
              session,
              communitySlug: payload.community.slug,
            });
            current.setPublicCommunityAccess(access);
          } catch {
            current.setPublicCommunityAccess(null);
            // ignore; fall back to the public funnel
          }
        } else {
          current.setPublicCommunityAccess(null);
        }

        if (
          session &&
          deriveCommunityJoinMode(payload.community as { entry_policy?: unknown }) === "join_approval"
        ) {
          void loadMyJoinRequestBySlug(payload.community.slug, session);
        }

      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load community.";
        current.setPublicCommunityError(message);
      } finally {
        current.setIsLoadingPublicCommunity(false);
      }
    },
    [loadMyJoinRequestBySlug],
  );

  const startCheckoutForPlan = useCallback(
    async (communitySlug: string, billingPeriod: CommunityBillingPeriod, cancelPath: string): Promise<void> => {
      const current = argsRef.current;
      current.setCheckoutStatus("loading");
      current.setCheckoutError(null);
      try {
        const origin = window.location.origin.replace(/\/+$/, "");
        const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}${cancelPath}`;
        const brandosAid = getBrandosAidForCommunitySlug(communitySlug);
        const rawSession = current.getSession();
        const session = current.ensureSession ? await current.ensureSession(rawSession) : rawSession;
        const data = await startCloudPublicFunnelCheckout<CloudSession>({
          session,
          communitySlug,
          billingPeriod,
          successUrl,
          cancelUrl,
          brandosAid,
        });
        const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url : "";
        if (!checkoutUrl) throw new Error("Missing checkout_url.");
        current.navigateToUrl(checkoutUrl);
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to start checkout.";
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
    startCheckoutForPlan,
  };
}
