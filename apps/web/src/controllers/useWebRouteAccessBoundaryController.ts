import { useEffect, useMemo, useRef, useState } from "react";

import type { AppPage } from "../../../../shared/appShellNavigation";
import {
  APP_ADMISSION_TIMEOUT_MS,
  withAsyncDeadline,
} from "../../../../shared/asyncDeadline";
import { fetchCloudMyCommunityAccessBySlug } from "../../../../shared/cloudCommunityAccessGateway";
import type { PublicRoute } from "../../../../shared/webAppRouteState";
import {
  resolveWebRouteAccessProjection,
  type WebRouteAuthState,
  type WebRouteScopedAccessState,
} from "../../../../shared/webRouteAccess";

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
};

type CommunityResolution = {
  slug: string | null;
  state: WebRouteScopedAccessState;
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
  operatorAccessState: WebRouteScopedAccessState;
  accountSetupAccessState: WebRouteScopedAccessState;
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
  const [communityResolution, setCommunityResolution] =
    useState<CommunityResolution>({
      slug: null,
      state: "not_applicable",
    });
  const [communityResolutionError, setCommunityResolutionError] =
    useState<string | null>(null);
  const [communityResolutionAttempt, setCommunityResolutionAttempt] = useState(0);
  const redirectKeyRef = useRef<string | null>(null);

  const slug = String(params.activeCommunitySlug ?? "").trim();
  const matchedCommunity =
    params.publicRoute.kind === "app" && params.activePage === "community"
      ? params.communities.find(
          (community) => String(community.slug ?? "").trim() === slug,
        ) ?? null
      : null;

  useEffect(() => {
    if (
      params.publicRoute.kind !== "app" ||
      params.activePage !== "community" ||
      !slug ||
      !params.isAuthBootstrapComplete ||
      params.authState !== "signed_in" ||
      !params.session
    ) {
      setCommunityResolution((current) =>
        current.slug === null && current.state === "not_applicable"
          ? current
          : { slug: null, state: "not_applicable" },
      );
      setCommunityResolutionError(null);
      return;
    }

    if (matchedCommunity) {
      setCommunityResolution((current) =>
        current.slug === slug && current.state === "allowed"
          ? current
          : { slug, state: "allowed" },
      );
      setCommunityResolutionError(null);
      return;
    }

    let cancelled = false;
    setCommunityResolution({ slug, state: "resolving" });
    setCommunityResolutionError(null);
    void (async () => {
      try {
        const session = await params.ensureSession(params.session);
        if (cancelled) return;
        if (!session) {
          setCommunityResolution({ slug, state: "failed" });
          setCommunityResolutionError(
            "Polynet could not finish verifying community access. Try again.",
          );
          return;
        }
        const access =
          await fetchCloudMyCommunityAccessBySlug<SessionT, TCommunityAccess>({
            session,
            communitySlug: slug,
          });
        if (cancelled) return;
        if (access && (access.can_enter_community || access.is_owner)) {
          await withAsyncDeadline(params.loadCommunities(session), {
            timeoutMs: APP_ADMISSION_TIMEOUT_MS,
            code: "community_list_hydration_timeout",
          });
          if (cancelled) return;
          params.syncCommunitySelection({
            communityId: access.community_id,
            communitySlug: slug,
            preserveChannel: true,
          });
          setCommunityResolution({ slug, state: "allowed" });
          return;
        }
        setCommunityResolution({ slug, state: "denied" });
      } catch (error) {
        if (cancelled) return;
        console.warn("Failed to resolve joined community route by slug:", error);
        setCommunityResolution({ slug, state: "failed" });
        setCommunityResolutionError(
          "Polynet could not finish verifying community access. Try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    matchedCommunity,
    params.activePage,
    params.authState,
    params.ensureSession,
    params.isAuthBootstrapComplete,
    params.loadCommunities,
    params.publicRoute.kind,
    params.session,
    params.syncCommunitySelection,
    communityResolutionAttempt,
    slug,
  ]);

  const communityAccessState = useMemo<WebRouteScopedAccessState>(() => {
    if (
      params.publicRoute.kind !== "app" ||
      params.activePage !== "community" ||
      !slug
    ) {
      return "not_applicable";
    }
    if (params.authState !== "signed_in") return "resolving";
    if (matchedCommunity) return "allowed";
    if (communityResolution.slug !== slug) return "resolving";
    return communityResolution.state;
  }, [
    communityResolution,
    matchedCommunity,
    params.activePage,
    params.authState,
    params.publicRoute.kind,
    slug,
  ]);

  const projection = resolveWebRouteAccessProjection({
    publicRoute: params.publicRoute,
    activePage: params.activePage,
    pathname: params.pathname,
    authState: params.authState,
    communitySlug: slug,
    communityAccessState,
    operatorAccessState: params.operatorAccessState,
    accountSetupAccessState: params.accountSetupAccessState,
  });

  useEffect(() => {
    if (
      projection.kind !== "redirect_landing" &&
      projection.kind !== "redirect_member_entry" &&
      projection.kind !== "redirect_account_setup" &&
      projection.kind !== "redirect_community_funnel"
    ) {
      redirectKeyRef.current = null;
      return;
    }
    const destination =
      projection.kind === "redirect_community_funnel"
        ? `/c/${encodeURIComponent(projection.communitySlug)}`
        : projection.kind === "redirect_account_setup"
          ? "/onboarding"
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
    communityResolutionError,
    retryCommunityResolution: () => {
      setCommunityResolutionError(null);
      setCommunityResolutionAttempt((attempt) => attempt + 1);
    },
    shouldHoldRouteForAccess: projection.kind === "hold" ||
      projection.kind === "redirect_landing" ||
      projection.kind === "redirect_member_entry" ||
      projection.kind === "redirect_account_setup" ||
      projection.kind === "redirect_community_funnel",
  };
}
