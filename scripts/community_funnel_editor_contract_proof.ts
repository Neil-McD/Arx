import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const preview = read("apps/web/src/components/CommunityFunnelV1Preview.tsx");
const publicFunnel = read(
  "apps/web/src/components/WebPublicCommunityFunnel.tsx",
);
const routeController = read(
  "apps/web/src/controllers/useWebPublicCommunityRouteController.ts",
);
const previewController = read(
  "apps/web/src/controllers/useWebCommunityFunnelDraftPreviewController.ts",
);
const gateway = read("shared/cloudCommunityFunnelGateway.ts");
const documentContract = read("shared/communityFunnel.ts");
const invocationSurface = read("shared/runtimeInvocationSurface.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");
const backend = read("convex/communityFunnel.ts");
const schema = read("convex/schema.ts");

// Product surface: one persistent conversation beside one trusted preview.
assert.match(editor, /buildCommunityFunnelThreadKey/);
assert.match(editor, /useWebTurnRunnerController/);
assert.match(editor, /invocationSurface: "community_funnel_builder"/);
assert.match(editor, /uploadCloudThreadAttachmentFile/);
assert.match(editor, /CommunityFunnelV1Preview/);
assert.doesNotMatch(
  editor,
  /Save draft|Headline[\s\S]*Subheadline|custom html|custom css|script/i,
);

// The model produces a bounded design document, never executable page code.
assert.match(documentContract, /FUNNEL_SECTION_TYPES/);
assert.match(
  documentContract,
  /hero[\s\S]*media[\s\S]*benefits[\s\S]*social_proof[\s\S]*testimonial[\s\S]*faq[\s\S]*cta/,
);
assert.match(documentContract, /rawSections\.length > 10/);
assert.match(documentContract, /section\.type === "hero"\)\.length !== 1/);
assert.match(documentContract, /section\.type === "cta"\)\.length !== 1/);
assert.match(documentContract, /isSupportedCommunityFunnelVideoUrl/);
assert.match(
  schema,
  /draftDocumentV1:[\s\S]*draftRevision:[\s\S]*draftUpdatedByUserId:/,
);

// Storage remains manager-authorized and revision-safe.
assert.match(
  backend,
  /requireCommunityManager[\s\S]*expectedDraftRevision[\s\S]*community_funnel_draft_conflict/,
);
assert.match(backend, /validateCommunityFunnelDocumentV1/);
assert.match(backend, /getCommunityFunnelDraftInternal/);
assert.match(backend, /saveCommunityFunnelDraftInternal/);
assert.match(gateway, /communityFunnel:getCommunityFunnelDraftPreview/);
assert.doesNotMatch(gateway, /saveCloudCommunityFunnelDraft/);
assert.doesNotMatch(
  backend,
  /export const saveCommunityFunnelDraft = mutation/,
);

// Runtime authority is scoped twice: canonical thread + manager lens, then one
// discoverable manager-only canonical operation.
assert.match(
  invocationSurface,
  /COMMUNITY_FUNNEL_BUILDER_TOOL_NAME_SET[\s\S]*"polynet_list"[\s\S]*"polynet_read"[\s\S]*"polynet_call"/,
);
assert.match(
  invocationSurface,
  /Never publish, change pricing, change access policy/,
);
assert.match(runtimeResolution, /isCommunityFunnelThreadKeyForCommunity/);
assert.match(
  runtimeResolution,
  /community_funnel_builder[\s\S]*runtimeCommunityLensAuthority\?\.canManage !== true/,
);
assert.match(
  canonicalExecutor,
  /COMMUNITY_FUNNEL_UPDATE_OPERATION\s*=\s*\n?\s*"community\.funnel\.update_draft"/,
);
assert.match(
  canonicalExecutor,
  /evidenceSurface === "community_funnel_builder"[\s\S]*principalKind === "personal_agent"[\s\S]*canUseBuilderProjection/,
);
assert.match(canonicalExecutor, /saveCommunityFunnelDraftInternal/);
assert.match(canonicalExecutor, /current_state: currentState/);
assert.match(
  canonicalExecutor,
  /forbidden_effects: \["publish", "change_access", "change_pricing"\]/,
);

// Preview is analytics-free and disabled; live V0 remains the independent
// visitor surface until a later explicit publication slice.
assert.match(previewController, /fetchCloudCommunityFunnelDraftPreview/);
assert.match(
  publicFunnel,
  /isPreviewMode && publicCommunity[\s\S]*CommunityFunnelV1Preview/,
);
assert.match(publicFunnel, /return \([\s\S]*<WebCommunityVisitorSurface/);
assert.match(routeController, /recordVisit: !isPublicFunnelPreviewRoute/);
assert.match(preview, /button type="button" disabled/);
assert.doesNotMatch(preview, /onPrimaryAction/);

console.log(
  "PASS: Funnel V1 is an AI-assisted, manager-only bounded draft composer with canonical revision-safe persistence; preview remains disabled and live V0 remains separate.",
);
