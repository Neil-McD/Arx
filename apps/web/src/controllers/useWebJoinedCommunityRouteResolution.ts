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
  activeCommunityId: string | null;
  activeCommunitySlug: string | null;
  communities: TCommunity[];
  cloudSession: SessionT | null;
  isAuthBootstrapComplete: boolean;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
  loadCommunities: (session: SessionT) => Promise<void>;
  syncCommunitySelection: (opts: { communityId: string | null; communitySlug?: string | null }) => void;
  navigateTo: NavigateFn;
}) {
  useEffect(() => {
    if (params.publicRouteKind !== "app" || params.activePage !== "community") return;
    const slug = String(params.activeCommunitySlug ?? "").trim();
    if (!slug || !params.isAuthBootstrapComplete) return;

    const matchedCommunity =
      params.communities.find((community) => String(community.slug ?? "").trim() === slug) ?? null;
    if (matchedCommunity) {
      if (params.activeCommunityId !== matchedCommunity.id) {
        params.syncCommunitySelection({ communityId: matchedCommunity.id, communitySlug: slug });
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      if (!params.cloudSession) {
        if (!cancelled) {
          params.navigateTo(`/c/${encodeURIComponent(slug)}`, { replace: true });
        }
        return;
      }

      const session = await params.ensureSession(params.cloudSession);
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
          });
          return;
        }
        params.navigateTo(`/c/${encodeURIComponent(slug)}`, { replace: true });
      } catch (error) {
        console.warn("Failed to resolve joined community route by slug:", error);
        if (!cancelled) {
          params.navigateTo(`/c/${encodeURIComponent(slug)}`, { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    params.activeCommunityId,
    params.activeCommunitySlug,
    params.activePage,
    params.cloudSession,
    params.communities,
    params.ensureSession,
    params.isAuthBootstrapComplete,
    params.loadCommunities,
    params.navigateTo,
    params.publicRouteKind,
    params.syncCommunitySelection,
  ]);
}
