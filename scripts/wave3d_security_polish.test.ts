import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTelemetryRouteLabel } from "../shared/routePrivacy";
import { resolvePublicEntryRoute } from "../shared/publicEntryRoute";

const ROOT = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), "utf8");

describe("Wave 3D: pre-release security and telemetry polish", () => {
  it("strips checkout, returnTo, email, and arbitrary query parameters from telemetry route labels while preserving allowlisted keys", () => {
    expect(
      buildTelemetryRouteLabel({
        pathname: "/c/builders",
        search: "?checkout=chk_0123456789abcdef0123456789abcdef&email=a@b.com&utm_source=youtube",
      }),
    ).toBe("/c/builders?utm_source=youtube");

    expect(
      buildTelemetryRouteLabel({
        pathname: "/login",
        search: "?returnTo=%2Fc%2Fbuilders%3Fsecret%3D1&error_description=denied&error=access_denied",
      }),
    ).toBe("/login?error=access_denied");

    expect(
      buildTelemetryRouteLabel({
        pathname: "/settings/billing",
        search: "?setup_intent=seti_123&name=Neil&tab=billing",
      }),
    ).toBe("/settings/billing?tab=billing");
  });

  it("rejects non-canonical community slugs in the public entry route classifier", () => {
    expect(resolvePublicEntryRoute({ pathname: "/c/valid-slug-123" })).toEqual({
      kind: "community_landing",
      slug: "valid-slug-123",
    });
    expect(resolvePublicEntryRoute({ pathname: "/c/%2F%2Fevil.com" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/..%2Fadmin" })).toBeNull();
    expect(resolvePublicEntryRoute({ pathname: "/c/-leading-dash" })).toBeNull();
  });

  it("gates public community visit/checkout on session check, resets PostHog cleanly, and authenticates memory endpoints before lookup", () => {
    const publicShell = read("apps/web/src/components/WebPublicVisitorShell.tsx");
    const landingPage = read("apps/web/src/components/WebCommunityLandingPage.tsx");
    const posthog = read("apps/web/src/posthogAnalytics.ts");
    const memory = read("convex/communityMemory.ts");
    const rollups = read("convex/communityAnalyticsRollups.ts");

    expect(publicShell).toContain("sessionCheckPending={sessionCheckPending}");
    expect(publicShell).toMatch(/\.catch\(\(\) => \{\s*if \(!cancelled\) \{\s*setHandoffToStudioApp\(true\);/);
    expect(publicShell).toContain("hasRecentAuthFlowPending: hasRecentAuthFlowPending()");

    expect(landingPage).toContain("if (props.sessionCheckPending) return;");
    expect(landingPage).toContain("if (!data || props.sessionCheckPending) return;");

    expect(posthog).toContain("POSTHOG_IDENTIFIED_MARKER_KEY");
    expect(posthog).toMatch(/if \(lastIdentifiedUserId && lastIdentifiedUserId !== userId\) \{\s*posthog\.reset\(\);/);
    expect(posthog).toContain('(last.userId === null) === (userId === null)');

    expect(memory).toMatch(/export const listNoteSources = query\(\{[\s\S]{0,200}authenticateCommunityMember\(ctx, args\)/);
    expect(memory).toMatch(/export const undoLearnedNote = mutation\(\{[\s\S]{0,200}authenticateCommunityMember\(ctx, args\)/);
    expect(memory).toMatch(/export const undoMemoryRun = mutation\(\{[\s\S]{0,200}authenticateCommunityMember\(ctx, args\)/);

    expect(rollups).toContain("const OPERATOR_COMMUNITIES_BATCH_SIZE = 5;");
    expect(rollups).toContain("communityCreators: ownerSet.size");
  });
});
