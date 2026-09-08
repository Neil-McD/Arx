import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeImageResourceUrl } from "../shared/useImageResource";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("web shell refresh continuity contract", () => {
  it("keeps route admission inside one inert canonical shell", () => {
    const app = read("apps/web/src/App.tsx");
    const hold = read("apps/web/src/components/WebRouteAccessHold.tsx");
    const fallback = read("apps/web/src/components/WebAppMainSurfaceFallback.tsx");
    const communityBootstrap = read(
      "apps/web/src/components/WebCommunityInteractionBootstrap.tsx",
    );
    const css = read("apps/web/src/index.css");

    expect(app).not.toContain("Opening Polynet…");
    expect(app).toMatch(
      /if \(shouldHoldRouteForAccess\) \{[\s\S]*WebRouteAccessHold/,
    );
    expect(hold).toContain("WebShellChromeHost");
    expect(hold).toContain("WebAppMainSurfaceFallback");
    expect(hold).toContain("node.inert = true");
    expect(hold).toContain('aria-busy={!props.error}');
    expect(hold).toContain("quiet");
    expect(hold).toContain("globalOverlays={null}");
    expect(hold).toContain("railCommunities: []");
    expect(hold).toContain("communityChannels: []");
    expect(hold).toContain("memberFaces: []");
    expect(fallback).toContain("quiet={props.quiet}");
    expect(communityBootstrap).toMatch(
      /!props\.quiet \? \([\s\S]*Opening community…[\s\S]*\) : null/,
    );
    expect(css).not.toContain(".landing-auth-hold-content");
    expect(css).toContain(".web-route-access-hold-failure");
  });

  it("never redirects an unresolved valid community route to Discover", () => {
    const app = read("apps/web/src/App.tsx");

    expect(existsSync("apps/web/src/controllers/useWebMissingCommunityRouteGuard.ts"))
      .toBe(false);
    expect(app).not.toContain("useWebMissingCommunityRouteGuard");
  });

  it("keeps thread selection explicit and ephemeral", () => {
    const projection = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");

    expect(projection).not.toContain("interaction:selectedRoot");
    expect(projection).not.toContain("readStoredSelectedRoot");
    expect(projection).not.toContain("writeStoredSelectedRoot");
    expect(projection).not.toContain("localStorage");
  });

  it("uses live subscriptions as the normal interaction acquisition owner", () => {
    const projection = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");
    const composer = read("apps/web/src/controllers/useWebCommunityChatController.ts");

    expect(projection).toContain("subscribeCloudCommunityInteractionRoots");
    expect(projection).toContain("subscribeCloudCommunityInteractionReplies");
    expect(projection).not.toContain("void loadRoots(activeCommunityId, sessionRef.current)");
    expect(projection).not.toContain("void loadReplies(next)");
    expect(composer).not.toContain("interaction.loadRoots");
    expect(composer).not.toContain("interaction.loadReplies");
  });

  it("uses shape-stable loading states for unresolved shell resources", () => {
    const nav = read("shared/CommunityNav.tsx");
    const context = read("apps/web/src/components/CommunityContextPanel.tsx");
    const facepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
    const memberAvatarStack = read("apps/web/src/components/MemberAvatarStack.tsx");
    const interaction = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");
    const app = read("apps/web/src/App.tsx");

    expect(nav).toContain('className="community-channel-loading-row web-skeleton-row"');
    expect(nav).toContain('className="community-channel-loading-row is-short web-skeleton-row"');
    expect(context).not.toContain("CommunityMemoryGraphPreview");
    expect(context).toContain("community-context-member-skeleton");
    expect(context).not.toContain("Loading members...");
    expect(context).not.toContain("Loading memory...");
    expect(facepile).toContain("isLoading={props.isLoading}");
    expect(memberAvatarStack).toContain("visibleFaces.length === 0 && props.isLoading");
    expect(interaction).toMatch(
      /isLoadingRoots:[\s\S]*!requestedBoundary \|\| !isPresentationScopedToBoundary \|\| isLoadingRoots/,
    );
    expect(interaction).toMatch(
      /const reset = useCallback\(\(isNextBoundaryLoading = false\)[\s\S]*setIsLoadingRoots\(isNextBoundaryLoading\)[\s\S]*boundaryRef\.current = requestedBoundary;[\s\S]*reset\(true\)/,
    );
    expect(app).toMatch(
      /isAwaitingActiveCommunityInteractionScope = Boolean\([\s\S]*!activeCommunityChannelResolutionError &&[\s\S]*!isActiveCommunityChannelReady \|\| !activeChannelCommunityId[\s\S]*isLoadingRoots:[\s\S]*isAwaitingActiveCommunityInteractionScope/,
    );
  });

  it("never presents an unresolved presence snapshot as offline truth", () => {
    const context = read("apps/web/src/components/CommunityContextPanel.tsx");
    const shell = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
    const types = read("shared/communityTypes.ts");

    expect(types).toContain("online_user_ids?: string[] | null");
    expect(shell).toContain('status: "pending" | "resolved" | "failed"');
    expect(context).toContain("const isOnline = Boolean(props.onlineUserIds?.has(member.user_id))");
    expect(context).toContain("props.isLoadingPresence");
    expect(context).not.toContain("Offline —");
    expect(context).not.toContain("is-offline");
    expect(context).not.toMatch(/const online = props\.onlineUserIds \?\? new Set/);
  });

  it("keeps the session ensure callback stable across transport-session rotation", () => {
    const controller = read("apps/web/src/controllers/useWebAppAuthController.ts");
    const start = controller.indexOf("const ensureUsableAuthSession = useCallback");
    const end = controller.indexOf("\n\n  const beginSignInFlow", start);
    const ensureBlock = controller.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(ensureBlock).toContain("currentSession: AuthSession | null | undefined = sessionRef.current");
    expect(ensureBlock).not.toContain("sessionRef.current ?? session");
    expect(ensureBlock).not.toMatch(/refreshAuthSessionLockedResult, session\]/);
  });

  it("serializes credential refresh before resume data fan-out", () => {
    const lifecycle = read("shared/useAuthSessionLifecycle.ts");
    const start = lifecycle.indexOf("function useSessionResumeRefresh");
    const end = lifecycle.indexOf("\n\nexport function useAuthSessionLifecycle", start);
    const resumeBlock = lifecycle.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(resumeBlock).toMatch(/await refreshSessionIfNearExpiry\(/);
    expect(resumeBlock).toMatch(
      /await refreshSessionIfNearExpiry\([\s\S]*const usableCandidate = params\.sessionRef\.current;[\s\S]*onResumeWithSessionRef\.current\(usableCandidate\)/,
    );
    expect(resumeBlock).not.toMatch(/void refreshSessionIfNearExpiry\(/);
  });

  it("uses one retained access snapshot for stable shell capabilities", () => {
    const controller = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");

    expect(controller).toContain("const activeCommunityAccess =");
    expect(controller).not.toContain("presentationActiveCommunityAccess");
    expect(controller).not.toContain("currentActiveCommunityAccess");
    expect(controller).not.toContain("authoritativeCommunityAccessCapabilities");
    expect(controller).not.toContain("authoritativeCommunityNavVisibility");
    expect(controller).not.toMatch(
      /const isLoadingCommunityAccess[\s\S]*?scopedCommunityAccessResolution\.status === "refreshing"/,
    );
    expect(controller).toMatch(
      /if \(accessSessionIdentityRef\.current !== sessionIdentity\) \{[\s\S]*type: "reset"[\s\S]*\}[\s\S]*accessSessionIdentityRef\.current = sessionIdentity/,
    );
    expect(controller).toMatch(
      /deriveCommunityActionGuards\(communityAccessCapabilities\)/,
    );
    expect(controller).toMatch(
      /deriveCommunityNavVisibility\(communityAccessCapabilities\)/,
    );
  });

  it("reserves permission-dependent navigation geometry during initial access loading", () => {
    const nav = read("shared/CommunityNav.tsx");
    const navSurface = read("apps/web/src/components/WebCommunityNavSurface.tsx");

    expect(nav).toContain("isLoadingAccess = false");
    expect(nav).toMatch(
      /const showChannelLoadingSkeleton =[\s\S]*isLoadingAccess \|\| \(isLoadingChannels/,
    );
    expect(nav).toContain("!showChannelLoadingSkeleton && canManageMembersActiveCommunity");
    expect(nav).toContain("community-nav-access-loading community-nav-utility-loading");
    expect(nav).toMatch(
      /isLoadingAccess \? \([\s\S]*Array\.from\(\{ length: 3 \}\)[\s\S]*title="Knowledge"[\s\S]*title="Events"/,
    );
    expect(nav).toContain('className="community-nav-access-loading-row web-skeleton-block"');
    expect(nav).toContain('className="community-nav-access-loading"');
    expect(nav).toContain('className="community-nav-invite-loading web-skeleton-block"');
    expect(nav).not.toContain("community-nav-loading-surface");
    expect(navSurface).toContain("isLoadingAccess={communityShell.isLoadingCommunityAccess}");
  });

  it("hydrates the account graph once per signed-in identity, not once per token", () => {
    const controller = read("apps/web/src/controllers/useWebAppAuthController.ts");

    expect(controller).toContain("sessionReadyIdentityRef");
    expect(controller).toMatch(
      /sessionReadyIdentityRef\.current === sessionIdentity\) return/,
    );
    expect(controller).toMatch(
      /sessionReadyIdentityRef\.current = null;[\s\S]*setAuthSession\(null\)/,
    );
  });

  it("keeps canonical chat mounted without a legacy chat loader", () => {
    const panel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
    const bootstrap = read(
      "apps/web/src/components/WebCommunityInteractionBootstrap.tsx",
    );
    const start = panel.indexOf("const communityChatPresentationMode =");
    const end = panel.indexOf("const communityComposerFocusTargetKey", start);
    const ownerGate = panel.slice(start, end);

    expect(ownerGate).toContain("resolveWebCommunityChatPresentationMode");
    expect(ownerGate).toContain("hasAuthenticatedPresentation");
    expect(ownerGate).toContain('communityChatPresentationMode === "canonical"');
    expect(ownerGate).toContain('communityChatPresentationMode === "canonical_bootstrap"');
    expect(ownerGate).not.toContain('communityChatPresentationMode === "legacy"');
    expect(ownerGate).not.toContain("showLegacyInteractionSurface");
    expect(panel).not.toContain("legacy_bootstrap");
    expect(bootstrap).toContain(
      "community-interaction-projection community-interaction-bootstrap",
    );
  });

  it("reserves selected-community geometry while auth restoration is unresolved", () => {
    const projection = read(
      "apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts",
    );
    const start = projection.indexOf("isResolvingSelectedCommunity:");
    const end = projection.indexOf("hasAuthenticatedPresentation:", start);
    const resolutionGate = projection.slice(start, end);

    expect(resolutionGate).toContain("!params.isAuthBootstrapComplete");
    expect(resolutionGate).toContain("params.hasAuthenticatedPresentation");
    expect(resolutionGate).toContain('params.activePage === "community"');
    expect(resolutionGate).toContain("params.selectedActiveCommunitySlug");
  });

  it("keeps the composer under canonical presentation ownership during bootstrap", () => {
    const panel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
    const bootstrap = read(
      "apps/web/src/components/WebCommunityInteractionBootstrap.tsx",
    );
    const responsiveStyles = read(
      "apps/web/src/styles/settings-runtime-and-theme-overrides.css",
    );

    expect(panel).toMatch(
      /showCanonicalCommunityBootstrap[\s\S]*WebCommunityInteractionBootstrap mainComposer=\{mainCommunityComposer\}/,
    );
    expect(bootstrap).toContain("community-interaction-main-composer");
    expect(responsiveStyles).toMatch(
      /\.app-root\.mobile-shell \.community-chat \.community-interaction-bootstrap-composer\s*\{[\s\S]*height:\s*66px;[\s\S]*margin:\s*0 12px calc\(env\(safe-area-inset-bottom, 0px\) \+ var\(--mobile-bottom-rail-height\) \+ 8px\);/,
    );
    expect(panel).not.toContain("showLegacyInteractionSurface");
    expect(panel).not.toContain(
      "{!showInteractionProjection ? mainCommunityComposer : null}",
    );
  });

  it("publishes the build identity of the JavaScript actually running in the page", () => {
    const main = read("apps/web/src/main.tsx");

    expect(main).toContain(
      'document.documentElement.setAttribute("data-polynet-build-id", APP_BUILD_ID)',
    );
  });

  it("never projects one community's channel catalog into another community", () => {
    const controller = read("apps/web/src/controllers/useWebCommunityChannelsController.ts");

    expect(controller).toContain("isPresentationScopedToActiveCommunity");
    expect(controller).toMatch(
      /const presentedChannels = isPresentationScopedToActiveCommunity[\s\S]*GENERAL_FALLBACK_CHANNEL/,
    );
    expect(controller).toMatch(
      /resolveWebCommunityChannelSelection\(\{[\s\S]*channels: presentedChannels/,
    );
    expect(controller).toContain("channelScopeSessionIdentityRef");
  });

  it("scopes feed, members, and memory synchronously across community boundaries", () => {
    const interaction = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");
    const directory = read("shared/useCommunityDirectoryController.ts");
    const polynet = read("apps/web/src/controllers/useWebCommunityPolynetController.ts");

    expect(interaction).toContain("isPresentationScopedToBoundary");
    expect(interaction).toContain("roots: presentedRoots");
    expect(directory).toContain("requestedPresentationScope");
    expect(directory).toContain("communityDirectoryMembers: isPresentationScoped");
    expect(polynet).toContain("overview: presentedOverview");
  });

  it("does not paint avatar images before canonical geometry exists", () => {
    const stableMedia = read("shared/StableFramedMedia.tsx");

    expect(stableMedia).toContain("showImage && layout");
    expect(stableMedia).toContain('referrerPolicy="no-referrer"');
  });

  it("normalizes image-resource identity before cache lookup", () => {
    expect(normalizeImageResourceUrl(" https://example.com/a.png "))
      .toBe("https://example.com/a.png");
    expect(normalizeImageResourceUrl("  ")).toBeNull();
    expect(normalizeImageResourceUrl(null)).toBeNull();
  });
});
