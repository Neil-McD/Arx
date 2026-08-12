import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const app = read("apps/web/src/App.tsx");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const gateway = read("shared/cloudCommunityFunnelGateway.ts");
const invocation = read("shared/runtimeInvocationSurface.ts");

assert.doesNotMatch(
  editor,
  /funnelDraftSlot|selected_slot|custom_1|custom_2|CommunityFunnelV1Preview/,
  "the editor must expose one canonical custom draft, not slots or V1 surfaces",
);
assert.match(
  editor,
  /buildCommunityFunnelThreadKey\(props\.previewCommunity\.id\)/,
  "the composer must use the one community-scoped funnel thread",
);
assert.match(
  invocation,
  /return `\$\{COMMUNITY_FUNNEL_THREAD_KEY_PREFIX\}:\$\{normalizedCommunityId\}`/,
  "the runtime thread key must not namespace legacy slots",
);
assert.match(
  editor,
  /Video Sales Letter[\s\S]*YouTube, Vimeo, Loom, or Wistia[\s\S]*Paste the VSL link/,
  "the creator-owned VSL must remain an explicit bounded field",
);
assert.match(
  editor,
  /Publish changes[\s\S]*Make live[\s\S]*Use default/,
  "publication, custom activation, and default restoration must remain separate explicit transitions",
);
assert.match(
  editor,
  /Describe the funnel or ask for a revision/,
  "the custom draft must remain editable through the existing agent harness",
);
assert.match(
  read("apps/web/src/components/WebCommunityFunnelRenderer.tsx"),
  /<div className="community-funnel-layout" aria-labelledby=\{titleId\}>/,
  "the canonical renderer must remain structurally neutral inside the route-owned main landmark",
);
assert.match(
  editor,
  /aria-label="Describe the funnel or ask for a revision"/,
  "the funnel composer must expose an accessible name",
);
for (const operation of [
  "setCloudCommunityFunnelDraftVsl",
  "publishCloudCommunityFunnelDraft",
  "setCloudCommunityFunnelLiveMode",
]) {
  assert.match(
    gateway,
    new RegExp(`export async function ${operation}`),
    `the client gateway must retain ${operation}`,
  );
}
assert.match(
  publicFunnel,
  /<WebCommunityFunnelRenderer/,
  "preview and live must share the canonical public renderer",
);
assert.doesNotMatch(
  publicFunnel,
  /WebCommunityVisitorSurface|CommunityFunnelV1Preview/,
  "retired visitor and V1 renderer surfaces must stay absent",
);
assert.match(
  app,
  /previewDocument: funnelDraftPreview\.document[\s\S]*previewVslUrl: funnelDraftPreview\.vslUrl/,
  "the owner preview must project the private canonical draft through the public renderer",
);
assert.match(
  app,
  /handleCancelPendingJoinRequest[\s\S]*onCancelPendingRequest: handleCancelPendingJoinRequest/,
  "public admission behavior must preserve pending-request cancellation",
);

console.log("community funnel editor contract proof passed");
