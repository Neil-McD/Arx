import {
  COMMUNITY_LAUNCH_SETUP_STEPS,
  type CommunityLaunchSetupStep,
} from "../../../shared/communityLaunchSetup";
import {
  buildAppRoutePath,
  buildWorkspaceDraftPath,
} from "../../../shared/webAppRouteState";

export const COMMUNITY_LAUNCH_SETUP_ROUTE_PARAM_NAMES = [
  "community_launch_setup",
  "community_launch_step",
  "community_launch_community_id",
  "community_launch_community_slug",
] as const;

export type CommunityLaunchSetupRouteContext = {
  shouldRestore: boolean;
  step: CommunityLaunchSetupStep | null;
  communityId: string | null;
  communitySlug: string | null;
};

export function normalizeLaunchSetupRouteParam(
  value: unknown,
  maxLength = 300,
): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function parseCommunityLaunchSetupRouteStep(
  value: unknown,
): CommunityLaunchSetupStep | null {
  const normalized = normalizeLaunchSetupRouteParam(value, 80);
  return COMMUNITY_LAUNCH_SETUP_STEPS.includes(normalized as CommunityLaunchSetupStep)
    ? (normalized as CommunityLaunchSetupStep)
    : null;
}

export function readCommunityLaunchSetupRouteContext(
  params: URLSearchParams,
): CommunityLaunchSetupRouteContext {
  const setup = String(params.get("community_launch_setup") ?? "")
    .trim()
    .toLowerCase();
  const shouldRestore = setup === "1" || setup === "true";
  return {
    shouldRestore,
    step: shouldRestore
      ? parseCommunityLaunchSetupRouteStep(params.get("community_launch_step"))
      : null,
    communityId: shouldRestore
      ? normalizeLaunchSetupRouteParam(params.get("community_launch_community_id"))
      : null,
    communitySlug: shouldRestore
      ? normalizeLaunchSetupRouteParam(params.get("community_launch_community_slug"))
      : null,
  };
}

export function readCurrentCommunityLaunchSetupRouteContext(): CommunityLaunchSetupRouteContext {
  if (typeof window === "undefined") {
    return {
      shouldRestore: false,
      step: null,
      communityId: null,
      communitySlug: null,
    };
  }
  return readCommunityLaunchSetupRouteContext(new URLSearchParams(window.location.search));
}

export function buildCommunityLaunchSetupRoutePath(args: {
  step: CommunityLaunchSetupStep;
  communityId?: string | null;
  communitySlug?: string | null;
}): string {
  const communityId = normalizeLaunchSetupRouteParam(args.communityId);
  const communitySlug = normalizeLaunchSetupRouteParam(args.communitySlug);
  const routePath =
    buildAppRoutePath({
      page: "workspace",
      view: "home",
      settingsPage: "agent",
      communitySlug,
      communityTab: "chat",
      threadId: null,
    }) ?? buildWorkspaceDraftPath();
  const url = new URL(routePath, "https://www.polynet.ai");
  url.searchParams.set("community_launch_setup", "1");
  url.searchParams.set("community_launch_step", args.step);
  if (communityId) url.searchParams.set("community_launch_community_id", communityId);
  if (communitySlug) url.searchParams.set("community_launch_community_slug", communitySlug);
  return `${url.pathname}${url.search}`;
}
