import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const app = read("apps/web/src/App.tsx");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const gateway = read("shared/cloudCommunityFunnelGateway.ts");
const invocation = read("shared/runtimeInvocationSurface.ts");
const preview = read(
  "apps/web/src/controllers/useWebCommunityFunnelDraftPreviewController.ts",
);
const postcondition = read("shared/communityFunnelTurnPostcondition.ts");
const styles = read("apps/web/src/styles/community-and-content.css");
const runtime = read("convex/runtimeTurnHandlers.ts");
const runtimePrompt = read("shared/runtimeInvocationSurface.ts");

for (const label of ["Default", "Funnel 1", "Funnel 2"]) {
  assert.match(editor, new RegExp(`label: .${label}`));
}
assert.match(
  editor,
  /<WebPlatformTabList[\s\S]*ariaLabel="Community funnels"/,
  "the three-slot picker must use the canonical accessible tablist",
);
assert.match(
  editor,
  /buildPlatformSwitcherStyle\([\s\S]*funnelTabs\.length[\s\S]*style=\{funnelSwitcherStyle\}/,
  "the three-slot picker must compute its canonical pill geometry instead of using the two-slot fallback",
);
assert.match(
  editor,
  /selectedSlot === "default"[\s\S]*Built automatically from your community profile\. Always available\./,
  "the default slot must remain deterministic and immutable",
);
assert.match(
  editor,
  /buildCommunityFunnelThreadKey\([\s\S]*selectedCustomSlot \?\? "custom_1"/,
  "each custom slot must bind its own agent conversation",
);
assert.match(
  invocation,
  /slot === "custom_1" \? baseKey : `\$\{baseKey\}:\$\{slot\}`/,
  "custom two must be isolated without migrating the existing custom-one thread",
);
assert.match(
  editor,
  /Video Sales Letter[\s\S]*YouTube, Vimeo, Loom, or Wistia[\s\S]*Paste the VSL link/,
  "each editable slot must retain the bounded VSL field",
);
for (const operation of [
  "setCloudCommunityFunnelDraftVsl",
  "publishCloudCommunityFunnelDraft",
  "setCloudActiveCommunityFunnel",
]) {
  assert.match(gateway, new RegExp(`export async function ${operation}`));
}
assert.match(
  preview,
  /const variant = slot === "default" \? null : config\.custom_funnels\[slot\]/,
  "full preview must resolve only the selected private custom slot",
);
assert.match(
  publicFunnel,
  /previewSlot === "default"[\s\S]*active_slot: "default"[\s\S]*active_slot: previewSlot/,
  "full preview must distinguish deterministic default from selected custom content",
);
assert.match(
  publicFunnel,
  /<WebCommunityFunnelRenderer/,
  "default, draft preview, and live output must share the canonical renderer",
);
assert.match(
  app,
  /slot: publicFunnelPreviewSlot[\s\S]*previewSlot: publicFunnelPreviewSlot/,
  "the route-selected slot must flow through authorization and rendering",
);
assert.doesNotMatch(
  editor,
  /CommunityFunnelV1Preview|custom HTML|dangerouslySetInnerHTML/,
);
assert.match(
  postcondition,
  /params\.after\.draftRevision > params\.before\.draftRevision/,
  "a composer turn must advance the authoritative selected-slot revision",
);
assert.match(
  editor,
  /communityFunnelDraftAdvanced\([\s\S]*finished without saving this funnel/,
  "the UI must fail closed when authoritative draft state did not advance",
);
assert.match(
  runtime,
  /invocationSurface === "community_funnel_builder"[\s\S]*communityFunnelTurnPostconditionPassed\([\s\S]*writeReceiptObserved: funnelDraftWriteObserved[\s\S]*community_funnel_draft_not_saved/,
  "the runtime must verify selected-slot authority before persisting model success prose",
);
assert.match(
  postcondition,
  /writeReceiptObserved[\s\S]*communityFunnelDraftAdvanced/,
  "the runtime postcondition must require both this turn's write receipt and authoritative revision advancement",
);
assert.match(
  runtimePrompt,
  /turn is incomplete until polynet_call returns a successful saved draft at a higher draft revision/,
  "the bounded model prompt must agree with the runtime postcondition",
);
assert.match(
  styles,
  /\.funnel-builder-conversation \{[\s\S]*overflow: hidden;/,
  "the composer rail must stay bounded inside the funnel surface",
);
assert.match(
  styles,
  /grid-template-columns: minmax\(0, 1fr\) clamp\(320px, 34%, 400px\)/,
  "the desktop builder must keep a readable bounded inspector beside the flexible preview",
);
assert.match(
  styles,
  /container: funnel-workspace \/ inline-size[\s\S]*@container funnel-workspace \(max-width: 980px\)/,
  "responsive funnel composition must follow the actual workspace width rather than the browser viewport",
);
assert.doesNotMatch(
  editor,
  /workspaceView|ariaLabel="Funnel workspace"|data-workspace-view/,
  "preview and AI builder must remain visible together instead of adding a second navigation mode",
);
assert.doesNotMatch(
  styles,
  /funnel-builder-workspace-switcher|data-workspace-view|\.funnel-builder-conversation\s*,[\s\S]*display:\s*none/,
  "responsive composition must never hide either half of the funnel workbench",
);
assert.doesNotMatch(
  styles,
  /\.funnel-builder-layout\.is-custom \{\s*display: block;/,
  "the funnel workspace must not regress to an unbounded vertical stack",
);

console.log("community funnel editor contract proof passed");
