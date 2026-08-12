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

console.log("community funnel editor contract proof passed");
