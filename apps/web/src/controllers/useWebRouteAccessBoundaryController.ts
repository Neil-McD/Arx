import { useEffect, useRef } from "react";

import type { AppPage } from "../../../../shared/appShellNavigation";
import type { PublicRoute } from "../../../../shared/webAppRouteState";
import {
  resolveWebRouteAccessProjection,
  type WebRouteAuthState,
  type WebRouteScopedAccessState,
} from "../../../../shared/webRouteAccess";
import { useWebCommunityRouteResolution } from "./useWebCommunityRouteResolution";

type NavigateFn = (
  path: string,
  options?: { replace?: boolean; state?: unknown },
) => void;

type CommunityLike = {
  id: string;
  slug: string;
};

type CommunityAccessLike = {
  community_id: string;
  can_enter_community?: boolean;
  is_owner: boolean;
  lifecycle_status?: "active" | "archiving" | "archived";
};

export function useWebRouteAccessBoundaryController<
  SessionT,
  TCommunity extends CommunityLike,
  TCommunityAccess extends CommunityAccessLike,
>(params: {
  publicRoute: PublicRoute;
  activePage: AppPage;
  activeCommunitySlug: string | null;
  pathname: string;
  authState: WebRouteAuthState;
  session: SessionT | null;
  isAuthBootstrapComplete: boolean;
  communities: TCommunity[];
  activeCommunityAccess?: TCommunityAccess | null;
  communityPreviewAccessState: WebRouteScopedAccessState;
  operatorAccessState: WebRouteScopedAccessState;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
  loadCommunities: (session: SessionT) => Promise<void>;
  syncCommunitySelection: (options: {
    communityId?: string | null;
    communitySlug?: string | null;
    preserveChannel?: boolean;
  }) => void;
  resolveAndEnterMemberDestination: (options?: {
    session?: SessionT | null;
    replace?: boolean;
  }) => Promise<boolean>;
  navigateTo: NavigateFn;
}) {
  const redirectKeyRef = useRef<string | null>(null);
  const communityResolution = useWebCommunityRouteResolution({
    publicRoute: params.publicRoute,
    activePage: params.activePage,
    activeCommunitySlug: params.activeCommunitySlug,
    authState: params.authState,
    session: params.session,
    isAuthBootstrapComplete: params.isAuthBootstrapComplete,
    communities: params.communities,
    activeCommunityAccess: params.activeCommunityAccess,
    ensureSession: params.ensureSession,
    loadCommunities: params.loadCommunities,
    syncCommunitySelection: params.syncCommunitySelection,
  });

  const projection = resolveWebRouteAccessProjection({
    publicRoute: params.publicRoute,
    activePage: params.activePage,
    pathname: params.pathname,
    authState: params.authState,
    communitySlug: communityResolution.slug,
    communityAccessState: communityResolution.accessState,
    communityPreviewAccessState: params.communityPreviewAccessState,
    operatorAccessState: params.operatorAccessState,
  });

  useEffect(() => {
    if (
      projection.kind !== "redirect_landing" &&
      projection.kind !== "redirect_member_entry" &&
      projection.kind !== "redirect_community_funnel"
    ) {
      redirectKeyRef.current = null;
      return;
    }
    const destination =
      projection.kind === "redirect_community_funnel"
        ? `/c/${encodeURIComponent(projection.communitySlug)}`
        : projection.kind === "redirect_member_entry"
          ? "member-entry"
        : "/";
    const redirectKey = `${params.pathname}:${destination}`;
    if (redirectKeyRef.current === redirectKey) return;
    redirectKeyRef.current = redirectKey;
    if (projection.kind === "redirect_member_entry") {
      void params
        .resolveAndEnterMemberDestination({
          session: params.session,
          replace: true,
        })
        .then((entered) => {
          if (!entered) params.navigateTo("/discover", { replace: true });
        });
      return;
    }
    params.navigateTo(destination, { replace: true });
  }, [
    params.navigateTo,
    params.pathname,
    params.resolveAndEnterMemberDestination,
    params.session,
    projection,
  ]);

  return {
    projection,
    inactiveCommunityRoute: communityResolution.inactiveCommunityRoute,
    shouldHoldRouteForAccess: projection.kind === "hold" ||
      projection.kind === "redirect_landing" ||
      projection.kind === "redirect_member_entry" ||
      projection.kind === "redirect_community_funnel",
  };
}
