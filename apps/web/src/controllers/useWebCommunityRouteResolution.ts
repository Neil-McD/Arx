import { useEffect, useMemo, useState } from "react";

import type { AppPage } from "../../../../shared/appShellNavigation";
import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import type { CommunityLifecycleStatus } from "../../../../shared/communityLifecycle";
import { communityLifecycleIsInactive } from "../../../../shared/communityLifecycleManagement";
import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type {
  WebRouteAuthState,
  WebRouteScopedAccessState,
} from "../../../../shared/webRouteAccess";

type CommunityLike = {
  id: string;
  slug: string;
};

type CommunityAccessLike = {
  community_id: string;
  can_enter_community?: boolean;
  is_owner: boolean;
  lifecycle_status?: CommunityLifecycleStatus;
};

export type InactiveCommunityRoute = {
  communityId: string;
  slug: string;
  lifecycleStatus: "archiving" | "archived";
  isOwner: boolean;
};

type CommunityResolution = {
  slug: string | null;
  state: WebRouteScopedAccessState;
  inactiveRoute: InactiveCommunityRoute | null;
};

export function useWebCommunityRouteResolution<
  SessionT,
  TCommunity extends CommunityLike,
  TCommunityAccess extends CommunityAccessLike,
>(params: {
  publicRoute: PublicRoute;
  activePage: AppPage;
  activeCommunitySlug: string | null;
  authState: WebRouteAuthState;
  session: SessionT | null;
  isAuthBootstrapComplete: boolean;
  communities: TCommunity[];
  activeCommunityAccess?: TCommunityAccess | null;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
  loadCommunities: (session: SessionT) => Promise<void>;
  syncCommunitySelection: (options: {
    communityId?: string | null;
    communitySlug?: string | null;
    preserveChannel?: boolean;
  }) => void;
}) {
  const [resolution, setResolution] = useState<CommunityResolution>({
    slug: null,
    state: "not_applicable",
    inactiveRoute: null,
  });
  const slug = String(params.activeCommunitySlug ?? "").trim();
  const matchedCommunity =
    params.publicRoute.kind === "app" && params.activePage === "community"
      ? params.communities.find(
          (community) => String(community.slug ?? "").trim() === slug,
        ) ?? null
      : null;
  const matchedInactiveRoute = useMemo<InactiveCommunityRoute | null>(() => {
    const lifecycleStatus = communityLifecycleIsInactive(
      params.activeCommunityAccess?.lifecycle_status,
    )
      ? params.activeCommunityAccess.lifecycle_status
      : null;
    if (
      !matchedCommunity ||
      params.activeCommunityAccess?.community_id !== matchedCommunity.id ||
      !lifecycleStatus
    ) {
      return null;
    }
    return {
      communityId: params.activeCommunityAccess.community_id,
      slug,
      lifecycleStatus,
      isOwner: Boolean(params.activeCommunityAccess.is_owner),
    };
  }, [
    matchedCommunity,
    params.activeCommunityAccess?.community_id,
    params.activeCommunityAccess?.is_owner,
    params.activeCommunityAccess?.lifecycle_status,
    slug,
  ]);

  useEffect(() => {
    if (
      params.publicRoute.kind !== "app" ||
      params.activePage !== "community" ||
      !slug ||
      !params.isAuthBootstrapComplete ||
      params.authState !== "signed_in" ||
      !params.session
    ) {
      setResolution((current) =>
        current.slug === null && current.state === "not_applicable"
          ? current
          : { slug: null, state: "not_applicable", inactiveRoute: null },
      );
      return;
    }
    if (matchedInactiveRoute) {
      setResolution({
        slug,
        state: "inactive",
        inactiveRoute: matchedInactiveRoute,
      });
      return;
    }
    if (matchedCommunity) {
      setResolution((current) =>
        current.slug === slug && current.state === "allowed"
          ? current
          : { slug, state: "allowed", inactiveRoute: null },
      );
      return;
    }

    let cancelled = false;
    setResolution({ slug, state: "resolving", inactiveRoute: null });
    void (async () => {
      const session = await params.ensureSession(params.session);
      if (cancelled) return;
      if (!session) {
        setResolution({ slug, state: "denied", inactiveRoute: null });
        return;
      }
      try {
        const access =
          await fetchCloudMyCommunityAccessBySlug<SessionT, TCommunityAccess>({
            session,
            communitySlug: slug,
          });
        if (cancelled) return;
        if (access?.can_enter_community) {
          await params.loadCommunities(session);
          if (cancelled) return;
          params.syncCommunitySelection({
            communityId: access.community_id,
            communitySlug: slug,
            preserveChannel: true,
          });
          setResolution({ slug, state: "allowed", inactiveRoute: null });
          return;
        }
        if (communityLifecycleIsInactive(access?.lifecycle_status)) {
          setResolution({
            slug,
            state: "inactive",
            inactiveRoute: {
              communityId: access.community_id,
              slug,
              lifecycleStatus: access.lifecycle_status,
              isOwner: Boolean(access.is_owner),
            },
          });
          return;
        }
        setResolution({ slug, state: "denied", inactiveRoute: null });
      } catch (error) {
        if (cancelled) return;
        console.warn("Failed to resolve joined community route by slug:", error);
        setResolution({ slug, state: "denied", inactiveRoute: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    matchedCommunity,
    matchedInactiveRoute,
    params.activePage,
    params.authState,
    params.ensureSession,
    params.isAuthBootstrapComplete,
    params.loadCommunities,
    params.publicRoute.kind,
    params.session,
    params.syncCommunitySelection,
    slug,
  ]);

  const accessState = useMemo<WebRouteScopedAccessState>(() => {
    if (
      params.publicRoute.kind !== "app" ||
      params.activePage !== "community" ||
      !slug
    ) {
      return "not_applicable";
    }
    if (params.authState !== "signed_in") return "resolving";
    if (matchedInactiveRoute) return "inactive";
    if (matchedCommunity) return "allowed";
    if (resolution.slug !== slug) return "resolving";
    return resolution.state;
  }, [
    matchedCommunity,
    matchedInactiveRoute,
    params.activePage,
    params.authState,
    params.publicRoute.kind,
    resolution,
    slug,
  ]);

  return {
    slug,
    accessState,
    inactiveCommunityRoute:
      matchedInactiveRoute ??
      (resolution.slug === slug && resolution.state === "inactive"
        ? resolution.inactiveRoute
        : null),
  };
}
