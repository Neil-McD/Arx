import type { AppPage } from "./appShellNavigation";
import {
  isLegacyWorkspaceRoutePath,
  type PublicRoute,
} from "./webAppRouteState";

export type WebRouteAuthState =
  | "signed_out"
  | "recovering_signed_in"
  | "signed_in";

export type WebRouteScopedAccessState =
  | "not_applicable"
  | "resolving"
  | "allowed"
  | "denied";

export type WebRouteAccessRequirement =
  | "public"
  | "member_entry"
  | "authenticated"
  | "community"
  | "community_preview"
  | "operator"
  | "legacy_entry";

export type WebRouteAccessProjection =
  | { kind: "render_public"; requirement: WebRouteAccessRequirement }
  | { kind: "render_authenticated"; requirement: WebRouteAccessRequirement }
  | { kind: "hold"; requirement: WebRouteAccessRequirement }
  | {
      kind: "redirect_landing";
      requirement: WebRouteAccessRequirement;
    }
  | {
      kind: "redirect_member_entry";
      requirement: WebRouteAccessRequirement;
    }
  | {
      kind: "redirect_community_funnel";
      requirement: WebRouteAccessRequirement;
      communitySlug: string;
    };

export function classifyWebRouteAccessRequirement(params: {
  publicRoute: PublicRoute;
  activePage: AppPage;
  pathname: string;
}): WebRouteAccessRequirement {
  if (params.publicRoute.kind === "community_funnel_preview") {
    return "community_preview";
  }
  if (params.publicRoute.kind !== "app") {
    return "public";
  }
  if (isLegacyWorkspaceRoutePath(params.pathname)) {
    return "legacy_entry";
  }
  if (params.activePage === "landing") return "member_entry";
  if (params.activePage === "community") return "community";
  if (params.activePage === "operator") return "operator";
  return "authenticated";
}

export function resolveWebRouteAccessProjection(params: {
  publicRoute: PublicRoute;
  activePage: AppPage;
  pathname: string;
  authState: WebRouteAuthState;
  communitySlug?: string | null;
  communityAccessState?: WebRouteScopedAccessState;
  communityPreviewAccessState?: WebRouteScopedAccessState;
  operatorAccessState?: WebRouteScopedAccessState;
}): WebRouteAccessProjection {
  const requirement = classifyWebRouteAccessRequirement(params);
  const communitySlug = String(
    params.publicRoute.kind === "community_funnel_preview"
      ? params.publicRoute.slug
      : params.communitySlug ?? "",
  ).trim();

  if (requirement === "public") {
    return { kind: "render_public", requirement };
  }

  if (requirement === "legacy_entry") {
    return { kind: "hold", requirement };
  }

  if (requirement === "member_entry") {
    return params.authState === "signed_out"
      ? { kind: "render_public", requirement }
      : { kind: "hold", requirement };
  }

  if (params.authState === "recovering_signed_in") {
    return { kind: "hold", requirement };
  }

  if (params.authState === "signed_out") {
    if (
      (requirement === "community" ||
        requirement === "community_preview") &&
      communitySlug
    ) {
      return {
        kind: "redirect_community_funnel",
        requirement,
        communitySlug,
      };
    }
    return { kind: "redirect_landing", requirement };
  }

  if (requirement === "community_preview") {
    const accessState =
      params.communityPreviewAccessState ?? "resolving";
    if (accessState === "allowed") {
      return { kind: "render_authenticated", requirement };
    }
    if (accessState === "denied" && communitySlug) {
      return {
        kind: "redirect_community_funnel",
        requirement,
        communitySlug,
      };
    }
    return { kind: "hold", requirement };
  }

  if (requirement === "community") {
    if (!communitySlug) {
      return { kind: "redirect_landing", requirement };
    }
    const accessState = params.communityAccessState ?? "resolving";
    if (accessState === "allowed") {
      return { kind: "render_authenticated", requirement };
    }
    if (accessState === "denied" && communitySlug) {
      return {
        kind: "redirect_community_funnel",
        requirement,
        communitySlug,
      };
    }
    return { kind: "hold", requirement };
  }

  if (requirement === "operator") {
    const accessState = params.operatorAccessState ?? "resolving";
    if (accessState === "allowed") {
      return { kind: "render_authenticated", requirement };
    }
    if (accessState === "denied") {
      return { kind: "redirect_member_entry", requirement };
    }
    return { kind: "hold", requirement };
  }

  return { kind: "render_authenticated", requirement };
}
