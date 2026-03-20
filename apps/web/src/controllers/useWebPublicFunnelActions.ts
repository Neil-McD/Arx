import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  classifyPublicCommunityJoinError, clearPendingPublicJoin, getBrandosAidForCommunitySlug, getErrorMessage, joinPublicCommunityRpc, readPendingPublicJoinBrandosAid, storePendingPublicJoin, } from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/cloudAuthIntent";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";

import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import {
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

      const rawSession = args.getSession();
      const session = args.ensureSession ? await args.ensureSession(rawSession) : rawSession;
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

        args.openCommunityWorkspace({
          communityId: joinedId,
          communitySlug: trimmedSlug || null,
        });
        await args.loadCommunities(session);
      } catch (error) {
        const message = getErrorMessage(error, "Failed to join community.");
        const kind = classifyPublicCommunityJoinError(error);
        if (kind === "approval_pending" || kind === "approval_denied") {
          clearPendingPublicJoin();
          args.setPublicJoinError(null);
          if (trimmedId) {
            args.setMyPublicCommunityJoinRequest({
              community_id: trimmedId,
              status: kind === "approval_denied" ? "denied" : "pending",
              updated_at: new Date().toISOString(),
            } as MyCommunityJoinRequestT);
          }
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
          args.setPublicJoinError("This community now requires a paid plan. Select a plan to continue.");
          args.setPublicCommunity((prev) =>
            prev
              ? ({
                  ...prev,
                  entry_policy: "paid_subscription",
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

  const loadPublicCommunity = useCallback(
    async (slug: string): Promise<void> => {
      const requestedSlug = slug.trim();
      if (!requestedSlug) return;
      const currentSlug = args.getCurrentPublicCommunitySlug();
      const isSameSlugRefresh = currentSlug === requestedSlug;

      args.setIsLoadingPublicCommunity(true);
      args.setPublicCommunityError(null);
      args.setPublicJoinError(null);
      if (!isSameSlugRefresh) {
        args.setPublicCommunity(null);
        args.setPublicCommunityPlans([]);
        args.setMyPublicCommunityJoinRequest(null);
        args.setPublicCommunityAccess(null);
      }
      try {
        const payload = await resolveCloudPublicFunnel<CloudSession, PublicCommunityT, PublicPlanT>({
          communitySlug: requestedSlug,
        });
        if (!payload?.community?.slug) throw new Error("Community not found.");

        const rawSession = args.getSession();
        const session = args.ensureSession ? await args.ensureSession(rawSession) : rawSession;
        if (session) {
          try {
            const access = await fetchCloudMyCommunityAccessBySlug<CloudSession, CommunityAccessRow>({
              session,
              communitySlug: payload.community.slug,
            });
            args.setPublicCommunityAccess(access);
          } catch {
            args.setPublicCommunityAccess(null);
            // ignore; fall back to the public funnel
          }
        } else {
          args.setPublicCommunityAccess(null);
        }

        args.setPublicCommunity({
          ...payload.community,
          visibility: toCanonicalCommunityVisibility(payload.community.visibility, "unlisted"),
        } as PublicCommunityT);
        args.setPublicCommunityPlans(payload.active_plan ? [payload.active_plan] : []);

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
        args.setPublicCommunityError(message);
      } finally {
        args.setIsLoadingPublicCommunity(false);
      }
    },
    [args, loadMyJoinRequestBySlug],
  );

  const startCheckoutForPlan = useCallback(
    async (communitySlug: string, billingPeriod: CommunityBillingPeriod, cancelPath: string): Promise<void> => {
      args.setCheckoutStatus("loading");
      args.setCheckoutError(null);
      try {
        const origin = window.location.origin.replace(/\/+$/, "");
        const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}${cancelPath}`;
        const brandosAid = getBrandosAidForCommunitySlug(communitySlug);
        const rawSession = args.getSession();
        const session = args.ensureSession ? await args.ensureSession(rawSession) : rawSession;
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
    loadPublicCommunity,
    startCheckoutForPlan,
  };
}
