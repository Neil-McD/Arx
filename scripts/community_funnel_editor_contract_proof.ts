import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const preview = read("apps/web/src/components/CommunityFunnelV1Preview.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const routeController = read("apps/web/src/controllers/useWebPublicCommunityRouteController.ts");
const previewController = read("apps/web/src/controllers/useWebCommunityFunnelDraftPreviewController.ts");
const gateway = read("shared/cloudCommunityFunnelGateway.ts");
const backend = read("convex/communityFunnel.ts");
const schema = read("convex/schema.ts");

assert.match(editor, /headline[\s\S]*subheadline[\s\S]*intro_video_url[\s\S]*pillars[\s\S]*founder_quote[\s\S]*faq/);
assert.match(editor, /Save draft/);
assert.match(editor, /disabled=\{isDirty \|\| isSavingCommunityFunnel\}/);
assert.doesNotMatch(editor, /custom html|custom css|script|arbitrary/i);

assert.match(schema, /draftDocumentV1:[\s\S]*draftRevision:[\s\S]*draftUpdatedByUserId:/);
assert.match(backend, /requireCommunityManager[\s\S]*expectedDraftRevision[\s\S]*community_funnel_draft_conflict/);
assert.match(backend, /if \(existing && !existing\.draftDocumentV1\)/);
assert.match(backend, /ctx\.db\.patch\(existing\._id as any, nextFields\)/);
assert.match(gateway, /communityFunnel:saveCommunityFunnelDraft/);
assert.match(gateway, /communityFunnel:getCommunityFunnelDraftPreview/);

assert.match(previewController, /fetchCloudCommunityFunnelDraftPreview/);
assert.match(publicFunnel, /isPreviewMode && publicCommunity[\s\S]*CommunityFunnelV1Preview/);
assert.match(publicFunnel, /return \([\s\S]*<WebCommunityVisitorSurface/);
assert.match(routeController, /recordVisit: !isPublicFunnelPreviewRoute/);
assert.match(preview, /button type="button" disabled/);
assert.doesNotMatch(preview, /onPrimaryAction/);

console.log("PASS: Funnel V1 is a bounded manager draft with revision-safe persistence and a disabled, analytics-free preview; the live V0 funnel remains separate.");
