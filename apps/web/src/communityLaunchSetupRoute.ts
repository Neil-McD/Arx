import {
  COMMUNITY_LAUNCH_SETUP_STEPS,
  type CommunityLaunchSetupStep,
} from "../../../shared/communityLaunchSetup";
import {
  buildWorkspaceCommunityDraftPath,
  buildWorkspaceDraftPath,
  isReservedWorkspaceRouteSegment,
  stripShellVariantFromPathname,
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

function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return segment.trim();
  }
}

function splitLaunchSetupPathSegments(pathname: string | null | undefined): string[] {
  const parsed = new URL(String(pathname || "/"), "https://www.polynet.ai");
  const stripped = stripShellVariantFromPathname(parsed.pathname || "/");
  const strippedParsed = new URL(stripped, "https://www.polynet.ai");
  return strippedParsed.pathname
    .split("/")
    .map(decodeRouteSegment)
    .filter(Boolean);
}

export function readCommunityLaunchSetupPathRouteContext(
  pathname: string | null | undefined,
): CommunityLaunchSetupRouteContext {
  const segments = splitLaunchSetupPathSegments(pathname);
  let communitySlug: string | null = null;
  let step: CommunityLaunchSetupStep | null = null;

  if (
    segments[0] === "workspace" &&
    segments[1] === "community" &&
    segments.length === 5 &&
    segments[3] === "setup"
  ) {
    communitySlug = normalizeLaunchSetupRouteParam(segments[2]);
    step = parseCommunityLaunchSetupRouteStep(segments[4]);
  } else if (
    segments[0] === "workspace" &&
    segments.length === 4 &&
    segments[2] === "setup" &&
    !isReservedWorkspaceRouteSegment(segments[1])
  ) {
    communitySlug = normalizeLaunchSetupRouteParam(segments[1]);
    step = parseCommunityLaunchSetupRouteStep(segments[3]);
  }

  return {
    shouldRestore: Boolean(communitySlug && step),
    step,
    communityId: null,
    communitySlug,
  };
}

export function isCommunityLaunchSetupRoutePath(
  pathname: string | null | undefined,
): boolean {
  return readCommunityLaunchSetupPathRouteContext(pathname).shouldRestore;
}

export function readCommunityLaunchSetupRouteContext(
  params: URLSearchParams,
  pathname?: string | null,
): CommunityLaunchSetupRouteContext {
  const pathContext = readCommunityLaunchSetupPathRouteContext(pathname);
  if (pathContext.shouldRestore) {
    return {
      ...pathContext,
      communityId: normalizeLaunchSetupRouteParam(
        params.get("community_launch_community_id"),
      ),
    };
  }

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
  return readCommunityLaunchSetupRouteContext(
    new URLSearchParams(window.location.search),
    window.location.pathname,
  );
}

export function buildCommunityLaunchSetupRoutePath(args: {
  step: CommunityLaunchSetupStep;
  communityId?: string | null;
  communitySlug?: string | null;
}): string {
  const communityId = normalizeLaunchSetupRouteParam(args.communityId);
  const communitySlug = normalizeLaunchSetupRouteParam(args.communitySlug);
  const communityRoutePath = buildWorkspaceCommunityDraftPath(communitySlug);
  if (communityRoutePath) {
    return `${communityRoutePath}/setup/${encodeURIComponent(args.step)}`;
  }

  const routePath = buildWorkspaceDraftPath();
  const url = new URL(routePath, "https://www.polynet.ai");
  url.searchParams.set("community_launch_setup", "1");
  url.searchParams.set("community_launch_step", args.step);
  if (communityId) url.searchParams.set("community_launch_community_id", communityId);
  if (communitySlug) url.searchParams.set("community_launch_community_slug", communitySlug);
  return `${url.pathname}${url.search}`;
}
