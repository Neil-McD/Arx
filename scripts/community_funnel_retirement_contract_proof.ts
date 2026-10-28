import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseCommunityTab } from "../shared/appShellNavigation.ts";
import { parsePublicRouteFromPath } from "../shared/webAppRouteState.ts";
import { resolveRuntimeInvocationSurfaceForThread } from "../shared/runtimeInvocationSurface.ts";

const read = (path: string) => readFileSync(path, "utf8");
const nav = read("shared/CommunityNav.tsx");
const panels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");

// Old funnel URLs land on Settings or the plain join page.
assert.equal(parseCommunityTab("funnel"), "settings");
assert.deepEqual(parsePublicRouteFromPath("/c/example/preview?slot=custom_1"), {
  kind: "community_funnel", slug: "example",
});

// The AI funnel builder cannot run.
assert.equal(resolveRuntimeInvocationSurfaceForThread({
  requestedSurface: "community_funnel_builder",
  threadKey: "community-funnel:example",
}), null);

// The editor, external website link and draft preview stay deleted (POL-23).
assert.doesNotMatch(nav, /onSelectTab\("funnel"\)/);
assert.doesNotMatch(panels, /communityTab === "funnel"|WebCommunityFunnelSection/);
assert.doesNotMatch(settingsSection, /WebCommunityExternalFunnelLink|Product website/);
for (const path of [
  "apps/web/src/components/WebCommunityFunnelEditor.tsx",
  "apps/web/src/components/WebCommunityFunnelSection.tsx",
  "apps/web/src/components/WebCommunityExternalFunnelLink.tsx",
  "apps/web/src/controllers/useWebCommunityFunnelDraftPreviewController.ts",
  "shared/cloudCommunityFunnelGateway.ts",
  "shared/communityExternalFunnel.ts",
]) {
  assert.equal(existsSync(path), false, `${path} stays deleted`);
}

// Backend: the funnel module and its stand-ins for the cached production web
// stay deleted; the join page reads the plain default from communityPublic.
assert.equal(existsSync("convex/communityFunnel.ts"), false, "convex/communityFunnel.ts stays deleted");
assert.match(read("convex/communityPublic.ts"), /funnel: COMMUNITY_FUNNEL_PUBLIC_CONFIG/, "the join page keeps the plain funnel projection");
console.log("community funnel retirement contract proof passed");
