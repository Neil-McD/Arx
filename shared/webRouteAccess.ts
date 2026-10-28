import type { AppPage } from "./appShellNavigation";
import {
  isLegacyWorkspaceRoutePath,
  type PublicRoute,
} from "./webAppRouteState";

export type WebRouteAuthState =
  | "signed_out"
  | "recovering_signed_in"
  | "verification_failed"
  | "signed_in";

export type WebRouteScopedAccessState =
  | "not_applicable"
  | "resolving"
  | "allowed"
  | "denied"
  | "failed";

export type WebRouteAccessRequirement =
  | "public"
  | "member_entry"
  | "account_setup"
  | "authenticated"
  | "community"
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
      kind: "redirect_account_setup";
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
  if (params.publicRoute.kind !== "app") {
    return "public";
  }
  if (isLegacyWorkspaceRoutePath(params.pathname)) {
    return "legacy_entry";
  }
  if (params.activePage === "landing") return "member_entry";
  if (params.activePage === "onboarding") return "account_setup";
  if (params.activePage === "community") return "community";
  if (params.activePage === "operator") return "operator";
  return "authenticated";
}

export function shouldHydrateWebRouteAccountSetup(params: {
  publicRoute: PublicRoute;
  activePage: AppPage;
  pathname: string;
}): boolean {
  const requirement = classifyWebRouteAccessRequirement(params);
  return (
    requirement === "account_setup" ||
    requirement === "authenticated" ||
    requirement === "community" ||
    requirement === "operator"
  );
}

export function resolveWebRouteAccessProjection(params: {
  publicRoute: PublicRoute;
  activePage: AppPage;
  pathname: string;
  authState: WebRouteAuthState;
  communitySlug?: string | null;
  communityAccessState?: WebRouteScopedAccessState;
  operatorAccessState?: WebRouteScopedAccessState;
  accountSetupAccessState?: WebRouteScopedAccessState;
}): WebRouteAccessProjection {
  const requirement = classifyWebRouteAccessRequirement(params);
  const communitySlug = String(params.communitySlug ?? "").trim();

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

  if (
    params.authState === "recovering_signed_in" ||
    params.authState === "verification_failed"
  ) {
    return { kind: "hold", requirement };
  }

  if (params.authState === "signed_out") {
    if (
      requirement === "community" &&
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

  if (requirement === "account_setup") {
    return { kind: "render_authenticated", requirement };
  }

  const accountSetupAccessState = params.accountSetupAccessState ?? "allowed";
  if (
    accountSetupAccessState === "resolving" ||
    accountSetupAccessState === "failed"
  ) {
    return { kind: "hold", requirement };
  }
  if (accountSetupAccessState === "denied") {
    return { kind: "redirect_account_setup", requirement };
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
