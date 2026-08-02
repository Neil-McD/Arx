import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveCurrentReadyImageUrl } from "../shared/useImageUrlReady";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("web shell refresh continuity contract", () => {
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

    expect(nav).toContain("community-channel-loading-row web-skeleton-row");
    expect(context).toContain("community-context-memory-preview web-skeleton-block");
    expect(context).toContain("community-context-member-skeleton");
    expect(context).not.toContain("Loading members...");
    expect(context).not.toContain("Loading memory...");
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
    expect(ownerGate).toContain("hasAuthenticatedPresentation");
    expect(ownerGate).toContain('communityChatPresentationMode === "canonical"');
    expect(ownerGate).toContain('communityChatPresentationMode === "canonical_bootstrap"');
    expect(ownerGate).toContain('communityChatPresentationMode === "legacy"');
    expect(panel).not.toContain("legacy_bootstrap");
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
    const stableAvatar = read("shared/StableAvatar.tsx");

    expect(imageReady).toContain("finish(image.naturalWidth > 0)");
    expect(stableAvatar).toContain("failedImageUrl");
    expect(stableAvatar).toContain("onError={() => setFailedImageUrl(normalizedImageUrl)}");
  });

  it("never reuses readiness from a previous avatar URL", () => {
    expect(resolveCurrentReadyImageUrl("https://example.com/a.png", "https://example.com/a.png"))
      .toBe("https://example.com/a.png");
    expect(resolveCurrentReadyImageUrl("https://example.com/b.png", "https://example.com/a.png"))
      .toBeNull();
    expect(resolveCurrentReadyImageUrl(null, "https://example.com/a.png"))
      .toBeNull();
  });
});
