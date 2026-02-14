import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  classifyPublicCommunityJoinError,
  clearPendingPublicJoin,
  getBrandosAidForCommunitySlug,
  getErrorMessage,
  joinPublicCommunityRpc,
  readPendingPublicJoinBrandosAid,
  storePendingPublicJoin,
} from "../../../../shared/pay_first";
import type { PendingAuthIntentInput } from "../../../../shared/supabaseAuthIntent";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";
import type { SupabaseSession } from "../supabase";
import { isCommunityJoinMode } from "../communityJoinPolicy";

type UseWebPublicFunnelActionsArgs<
  PublicCommunityT extends { slug: string; visibility: string; join_mode?: unknown; free_join_requires_approval?: boolean },
  PublicPlanT extends { billing_period: string },
  MyCommunityJoinRequestT extends { community_id: string; status: string },
> = {
  getSession: () => SupabaseSession | null;
  supabaseSession: SupabaseSession | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SupabaseSession) => Promise<Response>;
  fetchWithSupabasePublic: (url: string, init?: RequestInit) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  openAuthGate: (intentInput: PendingAuthIntentInput) => void;
  loadCommunities: (session: SupabaseSession) => Promise<void>;
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

type CommunityAccessRow = { community_id: string; can_view: boolean; is_owner: boolean };

export function useWebPublicFunnelActions<
  PublicCommunityT extends { slug: string; visibility: string; join_mode?: unknown; free_join_requires_approval?: boolean },
  PublicPlanT extends { billing_period: string },
  MyCommunityJoinRequestT extends { community_id: string; status: string },
>(args: UseWebPublicFunnelActionsArgs<PublicCommunityT, PublicPlanT, MyCommunityJoinRequestT>) {
  const loadMyJoinRequestBySlug = useCallback(
    async (communitySlug: string, session: SupabaseSession): Promise<void> => {
      const trimmed = communitySlug.trim();
      if (!trimmed) return;
      const url = args.getSupabaseUrl();
      if (!url) return;
      args.setIsLoadingMyPublicCommunityJoinRequest(true);
      try {
        const response = await args.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_my_join_request_by_slug`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_slug: trimmed }),
          },
          session,
        );
        if (!response.ok) throw new Error(await args.readSupabaseError(response));
        const rows = (await response.json()) as MyCommunityJoinRequestT[];
        args.setMyPublicCommunityJoinRequest(rows[0] ?? null);
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
      const url = session ? args.getSupabaseUrl() : null;
      if (!session || !url) {
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
          url,
          session,
          communityId: trimmedId || undefined,
          communitySlug: trimmedSlug || undefined,
          brandosAid: resolvedBrandosAid,
          fetchWithSupabaseAuth: args.fetchWithSupabaseAuth,
          readSupabaseError: args.readSupabaseError,
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
                  free_join_requires_approval: true,
                  join_mode: "request_access",
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
                  join_mode: "checkout",
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

      const session = args.getSession() ?? args.supabaseSession;
      const url = session ? args.getSupabaseUrl() : null;
      if (!session || !url) {
        args.openAuthGate({
          reason: "request_community_access",
          payload: { community_slug: trimmedSlug, message },
        });
        return;
      }

      args.setIsRequestingPublicCommunityAccess(true);
      args.setPublicRequestAccessError(null);
      try {
        const response = await args.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/request_community_access_by_slug`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_slug: trimmedSlug, p_message: message }),
          },
          session,
        );
        if (!response.ok) throw new Error(await args.readSupabaseError(response));
        const rows = (await response.json()) as MyCommunityJoinRequestT[];
        const row = rows[0] ?? null;
        args.setMyPublicCommunityJoinRequest(row);
        if ((row?.status ?? "").trim().toLowerCase() === "approved") {
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
                  join_mode: "checkout",
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
                  free_join_requires_approval: false,
                  join_mode: "join_free",
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
      const url = args.getSupabaseUrl();
      if (!url) {
        args.setPublicCommunityError("Missing Supabase URL.");
        return;
      }
      args.setIsLoadingPublicCommunity(true);
      args.setPublicCommunityError(null);
      args.setPublicJoinError(null);
      args.setPublicRequestAccessError(null);
      args.setPublicCommunity(null);
      args.setPublicCommunityPlans([]);
      args.setSelectedPublicCommunityBillingPeriod(null);
      args.setMyPublicCommunityJoinRequest(null);
      try {
        const response = await args.fetchWithSupabasePublic(`${url}/functions/v1/public_funnel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "resolve", community_slug: slug }),
        });
        if (!response.ok) throw new Error(await args.readSupabaseError(response));
        const payload = (await response.json()) as {
          ok?: boolean;
          community?: PublicCommunityT;
          active_plan?: PublicPlanT | null;
          active_plans?: PublicPlanT[] | null;
        };
        if (!payload?.community?.slug) throw new Error("Community not found.");

        const session = args.getSession();
        if (session) {
          try {
            const accessResponse = await args.fetchWithSupabaseAuth(
              `${url}/rest/v1/rpc/get_my_community_access_by_slug`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ p_community_slug: payload.community.slug }),
              },
              session,
            );
            if (accessResponse.ok) {
              const rows = (await accessResponse.json()) as CommunityAccessRow[];
              const access = rows[0] ?? null;
              if (access && (access.can_view || access.is_owner)) {
                args.openCommunityWorkspace(access.community_id);
                await args.loadCommunities(session);
                return;
              }
            }
          } catch {
            // ignore; fall back to public landing
          }
        }

        const plans = Array.isArray(payload.active_plans)
          ? payload.active_plans
          : payload.active_plan
            ? [payload.active_plan]
            : [];
        const payloadJoinMode = isCommunityJoinMode(payload.community.join_mode) ? payload.community.join_mode : null;
        const effectiveJoinMode = payloadJoinMode ?? "request_access";
        args.setPublicCommunity({
          ...payload.community,
          visibility: toCanonicalCommunityVisibility(payload.community.visibility, "unlisted"),
          join_mode: effectiveJoinMode,
        } as PublicCommunityT);
        args.setPublicCommunityPlans(plans);
        const preferred =
          plans.find((plan) => plan.billing_period === "monthly") ??
          plans.find((plan) => plan.billing_period === "yearly") ??
          plans[0] ??
          null;
        args.setSelectedPublicCommunityBillingPeriod(preferred?.billing_period ?? null);

        if (session && effectiveJoinMode === "request_access") {
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
      const url = args.getSupabaseUrl();
      if (!url) {
        args.setCheckoutError("Missing Supabase URL.");
        args.setCheckoutStatus("error");
        return;
      }
      args.setCheckoutStatus("loading");
      args.setCheckoutError(null);
      try {
        const origin = window.location.origin.replace(/\/+$/, "");
        const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${origin}${cancelPath}`;
        const brandosAid = getBrandosAidForCommunitySlug(communitySlug);
        const body = JSON.stringify({
          intent: "checkout",
          community_slug: communitySlug,
          billing_period: billingPeriod,
          success_url: successUrl,
          cancel_url: cancelUrl,
          tracking: brandosAid ? { brandos_aid: brandosAid } : undefined,
        });
        const session = args.getSession();
        const response = session
          ? await args.fetchWithSupabaseAuth(
              `${url}/functions/v1/public_funnel`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body },
              session,
            )
          : await args.fetchWithSupabasePublic(`${url}/functions/v1/public_funnel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            });
        if (!response.ok) throw new Error(await args.readSupabaseError(response));
        const data = (await response.json()) as { checkout_url?: unknown };
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
