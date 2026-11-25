import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Wave 3A: fast first load & on-demand screen boundaries", () => {
  it("keeps heavy markdown/highlight/math assets lazy-loaded and out of the root App bundle", () => {
    const app = read("apps/web/src/App.tsx");
    expect(app).not.toMatch(/from\s+["'][^"']*markdownUi["']/);
    expect(app).not.toMatch(/highlight\.js\/styles\/github-dark\.css/);
    const markdownUi = read("shared/markdownUi.tsx");
    expect(markdownUi).not.toMatch(/highlight\.js\/styles\/github-dark\.css/);
    expect(markdownUi).not.toMatch(/katex\/dist\/katex\.min\.css/);
    expect(markdownUi).toContain('import("./markdownHighlight")');
    expect(markdownUi).toContain('import("./markdownMath")');
  });

  it("defers Sentry and PostHog off the critical startup path via tree-shakable dynamic imports", () => {
    const instrument = read("apps/web/src/instrument.ts");
    const posthog = read("apps/web/src/posthogAnalytics.ts");
    expect(instrument).not.toMatch(/^import\s+\*\s+as\s+Sentry\s+from\s+["']@sentry\/react["']/m);
    expect(instrument).toContain('import("./sentryRuntime")');
    expect(instrument).toContain("pendingOperations");
    expect(posthog).not.toMatch(/^import\s+posthog\s+from\s+["']posthog-js["']/m);
    expect(posthog).toContain('import("./posthogRuntime")');
    expect(posthog).toContain("replayPendingPosthogOperations");
  });

  it("lazy-loads top-level routes, community secondary tabs, DM panels, and legal modals", () => {
    const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
    const communityHost = read("apps/web/src/components/WebCommunityHost.tsx");
    const secondaryPanels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
    const compositionRoot = read("apps/web/src/components/WebAppCompositionRoot.tsx");
    const dmHost = read("apps/web/src/components/WebDirectMessagesHost.tsx");
    const landing = read("apps/web/src/components/polynetLanding/ConversionLanding.tsx");
    const accountForm = read("apps/web/src/components/WebAccountSetupForm.tsx");

    expect(mainSurface).toMatch(/const WebCommunityHost = lazy\(/);
    expect(mainSurface).toMatch(/const WebSettingsSurfaceHost = lazy\(/);
    expect(mainSurface).toMatch(/const WebProductDocsPanel = lazy\(/);
    expect(mainSurface).toMatch(/const WebCommunityLandingPage = lazy\(/);
    expect(communityHost).toMatch(/const WebCommunitySecondaryPanels = lazy\(/);
    expect(communityHost).toMatch(/const WebCommunityMembersPage = lazy\(/);
    expect(secondaryPanels).toMatch(/const WebCommunityKnowledgePanel = lazy\(/);
    expect(secondaryPanels).toMatch(/const WebCommunitySettingsSection = lazy\(/);
    expect(secondaryPanels).toMatch(/const WebCommunityAnalyticsSection = lazy\(/);
    expect(secondaryPanels).toMatch(/const WebCommunityEventsSection = lazy\(/);
    expect(secondaryPanels).toMatch(/const WebCommunityPodsSection = lazy\(/);
    expect(compositionRoot).toMatch(/const WebDirectMessagesHost = lazy/);
    expect(dmHost).toMatch(/const WebDirectMessageInboxPanel = lazy\(/);
    expect(dmHost).toMatch(/const WebDirectMessagePanel = lazy\(/);
    expect(landing).not.toContain("WebPlatformLegalReaderModal");
    expect(landing).toContain('href="/privacy"');
    expect(landing).toContain('href="/terms"');
    expect(accountForm).toMatch(/const WebPlatformLegalReaderModal = lazy\(/);
  });
});
