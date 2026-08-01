import { useEffect } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import type { PublicRoute } from "../../../../shared/webAppRouteState";
import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";

type NavigateFn = (path: string, opts?: { replace?: boolean; state?: unknown }) => void;

type CommunityLike = {
  id: string;
  slug: string;
};

type CommunityAccessLike = {
  community_id: string;
  can_enter_community?: boolean;
  is_owner: boolean;
};

export function useWebJoinedCommunityRouteResolution<
  SessionT,
  TCommunity extends CommunityLike,
  TCommunityAccess extends CommunityAccessLike,
>(params: {
  publicRouteKind: PublicRoute["kind"];
  activePage: AppPage;
  activeCommunitySlug: string | null;
  communities: TCommunity[];
  session: SessionT | null;
  isAuthBootstrapComplete: boolean;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
  loadCommunities: (session: SessionT) => Promise<void>;
  syncCommunitySelection: (opts: {
    communityId?: string | null;
    communitySlug?: string | null;
    preserveChannel?: boolean;
  }) => void;
  navigateTo: NavigateFn;
}) {
  useEffect(() => {
    if (params.publicRouteKind !== "app" || params.activePage !== "community") return;
    const slug = String(params.activeCommunitySlug ?? "").trim();
    if (!slug || !params.isAuthBootstrapComplete) return;

    const matchedCommunity =
      params.communities.find((community) => String(community.slug ?? "").trim() === slug) ?? null;
    if (matchedCommunity) {
      return;
    }

    let cancelled = false;
    void (async () => {
      if (!params.session) {
        if (!cancelled) {
          params.navigateTo(`/c/${encodeURIComponent(slug)}`, { replace: true });
        }
        return;
      }

      const session = await params.ensureSession(params.session);
      if (cancelled || !session) return;
      try {
        const access = await fetchCloudMyCommunityAccessBySlug<SessionT, TCommunityAccess>({
          session,
          communitySlug: slug,
        });
        if (cancelled) return;
        if (access && (access.can_enter_community || access.is_owner)) {
          await params.loadCommunities(session);
          if (cancelled) return;
          params.syncCommunitySelection({
            communityId: access.community_id,
            communitySlug: slug,
            preserveChannel: true,
          });
          return;
        }
        params.navigateTo(`/c/${encodeURIComponent(slug)}`, { replace: true });
      } catch (error) {
        console.warn("Failed to resolve joined community route by slug:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    params.activeCommunitySlug,
    params.activePage,
    params.session,
    params.communities,
    params.ensureSession,
    params.isAuthBootstrapComplete,
    params.loadCommunities,
    params.navigateTo,
    params.publicRouteKind,
    params.syncCommunitySelection,
  ]);
}
