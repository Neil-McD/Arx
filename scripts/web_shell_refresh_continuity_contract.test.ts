import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("web shell refresh continuity contract", () => {
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

  it("keeps presentation capability separate from authoritative mutation guards", () => {
    const controller = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");

    expect(controller).toContain("presentationActiveCommunityAccess");
    expect(controller).toContain("authoritativeCommunityAccessCapabilities");
    expect(controller).toMatch(
      /deriveCommunityActionGuards\(authoritativeCommunityAccessCapabilities\)/,
    );
    expect(controller).toMatch(
      /deriveCommunityNavVisibility\(communityAccessCapabilities\)/,
    );
    expect(controller).toContain(
      "canPresentManageMembersActiveCommunity = communityNavVisibility.canManageMembers",
    );
    expect(controller).toContain(
      "canManageMembersActiveCommunity = authoritativeCommunityNavVisibility.canManageMembers",
    );
  });

  it("uses skeletons only for unresolved scoped shell data", () => {
    const rail = read("apps/web/src/components/WebDesktopCommunityRail.tsx");
    const nav = read("shared/CommunityNav.tsx");
    const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
    const directory = read("shared/useCommunityDirectoryController.ts");
    const presentation = read("shared/shellLoadingPresentation.ts");

    expect(presentation).toMatch(
      /args\.isPresentationExpected[\s\S]*!args\.hasResolved[\s\S]*args\.contentCount[\s\S]*!args\.hasError/,
    );
    expect(rail).toContain("shouldShowFirstResolutionSkeleton");
    expect(nav).toContain("shouldShowFirstResolutionSkeleton");
    expect(contextPanel).toContain("shouldShowFirstResolutionSkeleton");
    expect(directory).toContain(
      "hasResolvedCommunityDirectoryMembers: isPresentationScoped",
    );
  });

  it("retains scoped presence truth while distinguishing first resolution from refresh", () => {
    const controller = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");

    expect(controller).toContain(
      'status: "pending" | "resolved" | "refreshing" | "failed"',
    );
    expect(controller).toContain(
      'status: previous.status === "pending" ? "pending" : "refreshing"',
    );
    expect(controller).toMatch(
      /return activeCommunityPresenceSummaryState\.status/,
    );
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

  it("keeps canonical chat mounted independently of the legacy chat loader", () => {
    const panel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
    const start = panel.indexOf("const communityChatPresentationMode =");
    const end = panel.indexOf("const communityComposerFocusTargetKey", start);
    const ownerGate = panel.slice(start, end);

    expect(ownerGate).toContain("resolveWebCommunityChatPresentationMode");
    expect(ownerGate).toContain("interactionProjection?.enabled");
    expect(ownerGate).toContain("hasAuthenticatedPresentation");
    expect(ownerGate).toContain('communityChatPresentationMode === "canonical"');
    expect(ownerGate).toContain('communityChatPresentationMode === "canonical_bootstrap"');
    expect(ownerGate).toContain('communityChatPresentationMode === "legacy"');
    expect(panel).toMatch(
      /const showCommunityChatBootstrap =\s*communityChatPresentationMode === "legacy_bootstrap"/,
    );
    expect(panel).toContain(
      "community-interaction-projection has-context-panel community-interaction-bootstrap",
    );
  });

  it("keeps the composer under exactly one presentation owner during bootstrap", () => {
    const panel = read("apps/web/src/components/WebCommunityChatPanel.tsx");

    expect(panel).toMatch(
      /showCanonicalCommunityBootstrap[\s\S]*community-interaction-bootstrap[\s\S]*community-interaction-main-composer[\s\S]*mainCommunityComposer/,
    );
    expect(panel).toContain(
      "{showLegacyInteractionSurface ? mainCommunityComposer : null}",
    );
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

  it("falls back instead of admitting cached broken avatar images", () => {
    const imageReady = read("shared/useImageUrlReady.ts");
    const stableFramedMedia = read("shared/StableFramedMedia.tsx");

    expect(imageReady).toContain("finish(image.naturalWidth > 0)");
    expect(stableFramedMedia).toContain("failedImageUrl");
    expect(stableFramedMedia).toContain("onError={() => setFailedImageUrl(normalizedImageUrl)}");
    expect(stableFramedMedia).toContain("imageRef.current");
    expect(stableFramedMedia).toContain("image?.complete");
    expect(stableFramedMedia).toContain("syncNaturalSizeFromImage(event.currentTarget)");
  });
});
