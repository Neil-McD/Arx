import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Wave 3A: fast first load & on-demand screen boundaries", () => {
  it("keeps heavy markdown/highlight assets out of the root App bundle", () => {
    const app = read("apps/web/src/App.tsx");
    expect(app).not.toMatch(/from\s+["'][^"']*markdownUi["']/);
    expect(app).not.toMatch(/highlight\.js\/styles\/github-dark\.css/);
    const markdownUi = read("shared/markdownUi.tsx");
    expect(markdownUi).toContain('import "highlight.js/styles/github-dark.css";');
  });

  it("defers Sentry and PostHog off the critical startup path via dynamic imports", () => {
    const instrument = read("apps/web/src/instrument.ts");
    const posthog = read("apps/web/src/posthogAnalytics.ts");
    expect(instrument).not.toMatch(/^import\s+\*\s+as\s+Sentry\s+from\s+["']@sentry\/react["']/m);
    expect(instrument).toContain('import("@sentry/react")');
    expect(posthog).not.toMatch(/^import\s+posthog\s+from\s+["']posthog-js["']/m);
    expect(posthog).toContain('import("posthog-js")');
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
    expect(landing).toMatch(/const WebPlatformLegalReaderModal = lazy\(/);
    expect(accountForm).toMatch(/const WebPlatformLegalReaderModal = lazy\(/);
  });
});
