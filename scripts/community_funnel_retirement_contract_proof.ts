import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseCommunityTab } from "../shared/appShellNavigation.ts";
import { parsePublicRouteFromPath } from "../shared/webAppRouteState.ts";
import { resolveRuntimeInvocationSurfaceForThread } from "../shared/runtimeInvocationSurface.ts";

const read = (path: string) => readFileSync(path, "utf8");
const nav = read("shared/CommunityNav.tsx");
const panels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const funnel = read("convex/communityFunnel.ts");

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

// Backend: only the join page's intro media read and the four stand-ins for the
// cached production web remain; the two writes reject.
for (const operation of [
  "saveCommunityFunnelDraftInternal", "saveCommunityFunnelDraft", "setCommunityFunnelDraftVsl",
  "publishCommunityFunnelDraft", "setActiveCommunityFunnel", "getCommunityFunnelDraftInternal",
]) {
  assert.doesNotMatch(funnel, new RegExp(`export const ${operation} =`), `${operation} stays deleted`);
}
for (const operation of [
  "getCommunityFunnelConfig", "getCommunityFunnelDraftPreview",
  "setCommunityExternalFunnelUrl", "setCommunityExternalFunnelActive",
]) {
  assert.match(funnel, new RegExp(`export const ${operation} =`), `${operation} stand-in stays until the next production release`);
}
assert.equal((funnel.match(/community_funnel_retired/g) ?? []).length, 2, "both stand-in writes reject");
console.log("community funnel retirement contract proof passed");
