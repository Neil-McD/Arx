import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  classifyPublicCommunityJoinError, clearPendingPublicJoin, getBrandosAidForCommunitySlug, getErrorMessage, joinPublicCommunityRpc, readPendingPublicJoinBrandosAid, storePendingPublicJoin, } from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/cloudAuthIntent";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";

import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import {
  fetchCloudMyJoinRequestBySlug,
  requestCloudCommunityAccessBySlug,
  resolveCloudPublicFunnel,
  startCloudPublicFunnelCheckout,
} from "../../../../shared/cloudPublicFunnelGateway";
import type { CloudSession } from "../cloudAuth";
import { deriveCommunityJoinMode } from "../communityJoinPolicy";

type UseWebPublicFunnelActionsArgs<
  PublicCommunityT extends {
    slug: string;
    visibility: string;
    entry_policy?: unknown;
  },
  PublicPlanT extends { billing_period: string },
  MyCommunityJoinRequestT extends { community_id: string; status: string },
> = {
  getSession: () => CloudSession | null;
  session: CloudSession | null;
  openAuthGate: (intentInput: PendingAuthIntentInput) => void;
  loadCommunities: (session: CloudSession) => Promise<void>;
  openCommunityWorkspace: (communityId: string) => void;
  isUuid: (value: string) => boolean;

  setIsJoiningPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setPublicJoinError: Dispatch<SetStateAction<string | null>>;
  setPublicRequestAccessError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunity: Dispatch<SetStateAction<PublicCommunityT | null>>;

  setIsLoadingMyPublicCommunityJoinRequest: Dispatch<SetStateAction<boolean>>;
  setMyPublicCommunityJoinRequest: Dispatch<SetStateAction<MyCommunityJoinRequestT | null>>;
  setIsRequestingPublicCommunityAccess: Dispatch<SetStateAction<boolean>>;

  setIsLoadingPublicCommunity: Dispatch<SetStateAction<boolean>>;
  setPublicCommunityError: Dispatch<SetStateAction<string | null>>;
  setPublicCommunityPlans: Dispatch<SetStateAction<PublicPlanT[]>>;
  setSelectedPublicCommunityBillingPeriod: Dispatch<SetStateAction<string | null>>;

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
  PublicPlanT extends { billing_period: string },
  MyCommunityJoinRequestT extends { community_id: string; status: string },
>(args: UseWebPublicFunnelActionsArgs<PublicCommunityT, PublicPlanT, MyCommunityJoinRequestT>) {
  const loadMyJoinRequestBySlug = useCallback(
    async (communitySlug: string, session: CloudSession): Promise<void> => {
      const trimmed = communitySlug.trim();
      if (!trimmed) return;
      args.setIsLoadingMyPublicCommunityJoinRequest(true);
      try {
        const row = await fetchCloudMyJoinRequestBySlug<CloudSession, MyCommunityJoinRequestT>({
          session,
          communitySlug: trimmed,
        });
        args.setMyPublicCommunityJoinRequest(row);
      } catch (error) {
        console.warn("Failed to load join request:", error);
        args.setMyPublicCommunityJoinRequest(null);
      } finally {
        args.setIsLoadingMyPublicCommunityJoinRequest(false);
      }
    },
    [args],
  );

  const joinPublicCommunity = useCallback(
    async (opts: { communityId?: string; communitySlug?: string | null }): Promise<void> => {
      const trimmedId = (opts.communityId ?? "").trim();
      const trimmedSlug = (opts.communitySlug ?? "").trim();
      if (!trimmedId && !trimmedSlug) return;

      const brandosAid = trimmedSlug ? getBrandosAidForCommunitySlug(trimmedSlug) : null;

      const session = args.getSession();
      if (!session) {
        storePendingPublicJoin(trimmedSlug || trimmedId, brandosAid);
        args.openAuthGate({
          reason: "join_public_community",
          payload: {
            community_id: trimmedId || null,
            community_slug: trimmedSlug || null,
            brandos_aid: brandosAid,
          },
        });
        return;
      }

      args.setIsJoiningPublicCommunity(true);
      args.setPublicJoinError(null);
      try {
        const pendingBrandosAid = readPendingPublicJoinBrandosAid();
        const resolvedBrandosAid =
          (brandosAid && args.isUuid(brandosAid) ? brandosAid : null) ||
          (pendingBrandosAid && args.isUuid(pendingBrandosAid) ? pendingBrandosAid : null);

        const joinedId = await joinPublicCommunityRpc({
          session,
          communityId: trimmedId || undefined,
          communitySlug: trimmedSlug || undefined,
          brandosAid: resolvedBrandosAid,
        });
        clearPendingPublicJoin();

        args.openCommunityWorkspace(joinedId);
        await args.loadCommunities(session);
      } catch (error) {
        const message = getErrorMessage(error, "Failed to join community.");
        const kind = classifyPublicCommunityJoinError(error);
        if (kind === "approval_required") {
          clearPendingPublicJoin();
          args.setPublicJoinError(null);
          args.setPublicRequestAccessError("This community now requires approval. Request access to continue.");
          args.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "approval",
                } as PublicCommunityT)
              : prev,
          );
          if (trimmedSlug) {
            void loadMyJoinRequestBySlug(trimmedSlug, session);
          }
          return;
        }
        if (kind === "paid_plan_required") {
          clearPendingPublicJoin();
          args.setPublicRequestAccessError(null);
          args.setPublicJoinError("This community now requires a paid plan. Select a plan to continue.");
          args.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "paid_unlock",
                } as PublicCommunityT)
              : prev,
          );
          return;
        }
        args.setPublicJoinError(message);
      } finally {
        args.setIsJoiningPublicCommunity(false);
      }
    },
    [args, loadMyJoinRequestBySlug],
  );

  const requestCommunityAccess = useCallback(
    async (opts: { communitySlug: string; message?: string | null }): Promise<void> => {
      const trimmedSlug = (opts.communitySlug ?? "").trim();
      if (!trimmedSlug) return;
      const message = typeof opts.message === "string" ? opts.message.trim() || null : null;

      const session = args.getSession() ?? args.session;
      if (!session) {
        args.openAuthGate({
          reason: "request_community_access",
          payload: { community_slug: trimmedSlug, message },
        });
        return;
      }

      args.setIsRequestingPublicCommunityAccess(true);
      args.setPublicRequestAccessError(null);
      try {
        const row = await requestCloudCommunityAccessBySlug<CloudSession, MyCommunityJoinRequestT>({
          session,
          communitySlug: trimmedSlug,
          message,
        });
        args.setMyPublicCommunityJoinRequest(row);
        if (row && (row.status ?? "").trim().toLowerCase() === "approved") {
          args.openCommunityWorkspace(row.community_id);
          await args.loadCommunities(session);
        }
      } catch (error) {
        const resolved = getErrorMessage(error, "Failed to request access.");
        const kind = classifyPublicCommunityJoinError(error);
        if (kind === "paid_communities_do_not_use_request_access") {
          args.setPublicRequestAccessError("This community uses paid checkout. Select a plan to continue.");
          args.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "paid_unlock",
                } as PublicCommunityT)
              : prev,
          );
          return;
        }
        if (kind === "request_access_not_required") {
          args.setPublicRequestAccessError("Approval is no longer required. You can join for free now.");
          args.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "open",
                } as PublicCommunityT)
              : prev,
          );
          return;
        }
        args.setPublicRequestAccessError(resolved);
      } finally {
        args.setIsRequestingPublicCommunityAccess(false);
      }
    },
    [args],
  );

  const loadPublicCommunity = useCallback(
    async (slug: string): Promise<void> => {
      args.setIsLoadingPublicCommunity(true);
      args.setPublicCommunityError(null);
      args.setPublicJoinError(null);
      args.setPublicRequestAccessError(null);
      args.setPublicCommunity(null);
      args.setPublicCommunityPlans([]);
      args.setSelectedPublicCommunityBillingPeriod(null);
      args.setMyPublicCommunityJoinRequest(null);
      try {
        const payload = await resolveCloudPublicFunnel<CloudSession, PublicCommunityT, PublicPlanT>({
          communitySlug: slug,
        });
        if (!payload?.community?.slug) throw new Error("Community not found.");

        const session = args.getSession();
        if (session) {
          try {
            const access = await fetchCloudMyCommunityAccessBySlug<CloudSession, CommunityAccessRow>({
              session,
              communitySlug: payload.community.slug,
            });
            if (access && (access.can_enter_community || access.is_owner)) {
              args.openCommunityWorkspace(access.community_id);
              await args.loadCommunities(session);
              return;
            }
          } catch {
            // ignore; fall back to the public funnel
          }
        }

        const plans = Array.isArray(payload.active_plans)
          ? payload.active_plans
          : payload.active_plan
            ? [payload.active_plan]
            : [];
        args.setPublicCommunity({
          ...payload.community,
          visibility: toCanonicalCommunityVisibility(payload.community.visibility, "unlisted"),
        } as PublicCommunityT);
        args.setPublicCommunityPlans(plans);
        const preferred =
          plans.find((plan) => plan.billing_period === "monthly") ??
          plans.find((plan) => plan.billing_period === "yearly") ??
          plans[0] ??
          null;
        args.setSelectedPublicCommunityBillingPeriod(preferred?.billing_period ?? null);

        if (
          session &&
          deriveCommunityJoinMode(payload.community as { entry_policy?: unknown }) === "request_access"
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
        args.setPublicCommunityError(message);
      } finally {
        args.setIsLoadingPublicCommunity(false);
      }
    },
    [args, loadMyJoinRequestBySlug],
  );

  const startCheckoutForPlan = useCallback(
    async (communitySlug: string, billingPeriod: string, cancelPath: string): Promise<void> => {
      args.setCheckoutStatus("loading");
      args.setCheckoutError(null);
      try {
        const origin = window.location.origin.replace(/\/+$/, "");
        const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}${cancelPath}`;
        const brandosAid = getBrandosAidForCommunitySlug(communitySlug);
        const session = args.getSession();
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
        args.navigateToUrl(checkoutUrl);
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to start checkout.";
        args.setCheckoutError(message);
        args.setCheckoutStatus("error");
      }
    },
    [args],
  );

  return {
    joinPublicCommunity,
    requestCommunityAccess,
    loadPublicCommunity,
    startCheckoutForPlan,
  };
}
