import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCommunityTab } from "../shared/appShellNavigation.ts";
import { parsePublicRouteFromPath } from "../shared/webAppRouteState.ts";
import { resolveRuntimeInvocationSurfaceForThread } from "../shared/runtimeInvocationSurface.ts";

const read = (path: string) => readFileSync(path, "utf8");
const nav = read("shared/CommunityNav.tsx");
const panels = read("apps/web/src/components/WebCommunitySecondaryPanels.tsx");
const settingsSection = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const settings = read("apps/web/src/components/WebCommunityExternalFunnelLink.tsx");
const funnel = read("convex/communityFunnel.ts");

assert.equal(parseCommunityTab("funnel"), "settings");
assert.deepEqual(parsePublicRouteFromPath("/c/example/preview?slot=custom_1"), {
  kind: "community_funnel", slug: "example",
});
assert.equal(resolveRuntimeInvocationSurfaceForThread({
  requestedSurface: "community_funnel_builder",
  threadKey: "community-funnel:example",
}), null);
assert.doesNotMatch(nav, /onSelectTab\("funnel"\)/);
assert.doesNotMatch(panels, /communityTab === "funnel"/);
assert.match(settingsSection, /<WebCommunityExternalFunnelLink/);
assert.match(settings, /Product website/);
assert.match(settings, /Activate website in Discover/);
for (const operation of [
  "saveCommunityFunnelDraftInternal", "saveCommunityFunnelDraft", "setCommunityFunnelDraftVsl",
  "publishCommunityFunnelDraft", "setActiveCommunityFunnel",
]) {
  assert.match(funnel, new RegExp(`export const ${operation} =`));
}
assert.match(funnel, /community_funnel_builder_retired/);
assert.match(funnel, /export const setCommunityExternalFunnelUrl =/);
assert.match(funnel, /export const setCommunityExternalFunnelActive =/);
console.log("community funnel retirement contract proof passed");
