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
  });
});
