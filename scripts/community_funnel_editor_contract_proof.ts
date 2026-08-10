import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POLYNET_CANONICAL_TOOL_DEFINITIONS } from "../shared/polynetCanonicalToolContract.ts";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

const read = (path: string) => readFileSync(path, "utf8");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const app = read("apps/web/src/App.tsx");
const memberAgentDock = read(
  "apps/web/src/components/WebMemberAgentDock.tsx",
);
const memberAgentDockStyles = read(
  "apps/web/src/components/WebMemberAgentDock.css",
);
const secondaryPanels = read(
  "apps/web/src/components/WebCommunitySecondaryPanels.tsx",
);
const funnelSection = read(
  "apps/web/src/components/WebCommunityFunnelSection.tsx",
);
const communityStyles = read("apps/web/src/styles/community-and-content.css");
const preview = read("apps/web/src/components/CommunityFunnelV1Preview.tsx");
const previewStyles = read(
  "apps/web/src/components/CommunityFunnelV1Preview.css",
);
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
const contextIntegrity = read("shared/runtimeContextIntegrity.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");
const backend = read("convex/communityFunnel.ts");
const threads = read("convex/threads.ts");
const schema = read("convex/schema.ts");

// Product surface: one persistent conversation beside one trusted preview.
assert.match(editor, /buildCommunityFunnelThreadKey/);
assert.match(editor, /useWebTurnRunnerController/);
assert.match(editor, /invocationSurface: "community_funnel_builder"/);
assert.match(editor, /resolveAuthPresentationIdentity\(props\.session\)/);
assert.match(editor, /props\.ensureSession\(\s*sessionRef\.current,/);
assert.doesNotMatch(editor, /props\.previewCommunity\.name,\s*props\.session,/);
assert.match(editor, /uploadCloudMemberAgentImageFile/);
assert.match(
  editor,
  /uploadCloudMemberAgentImageFile\(\{[\s\S]*threadId: threadKey,[\s\S]*messageId,[\s\S]*file: referenceImage\.file/,
);
assert.doesNotMatch(editor, /uploadCloudThreadAttachmentFile/);
assert.match(editor, /CommunityFunnelV1Preview/);
assert.doesNotMatch(editor, /buildDefaultCommunityFunnelDocumentV1/);
assert.match(
  editor,
  /const document = props\.communityFunnelConfig\.draft_document_v1;/,
);
assert.match(editor, /disabled=\{!document\}/);
assert.match(editor, /\{document \? \([\s\S]*<CommunityFunnelV1Preview/);
assert.match(editor, /Nothing to preview yet\./);
assert.match(editor, /Prompt the agent to build your funnel\./);
assert.doesNotMatch(
  editor,
  /Save draft|Headline[\s\S]*Subheadline|custom html|custom css|script/i,
);

// The builder owns one viewport-height workspace. The outer community page is
// locked; only the preview and conversation history may scroll independently.
assert.match(
  secondaryPanels,
  /communityTab === "funnel"[\s\S]*renderWorkspacePane/,
);
assert.match(secondaryPanels, /className="community-tab-workspace"/);
assert.match(funnelSection, /community-funnel-panel/);
assert.match(
  communityStyles,
  /\.community-tab-workspace\s*\{[\s\S]*?overflow:\s*hidden;/,
);
assert.match(
  communityStyles,
  /\.community-funnel-panel\.settings-panel\s*\{[\s\S]*?overflow:\s*hidden;/,
);
assert.match(
  communityStyles,
  /\.funnel-builder-preview\s*\{[\s\S]*?overflow-y:\s*auto;/,
);
assert.match(
  communityStyles,
  /\.funnel-builder-messages\s*\{[\s\S]*?overflow-y:\s*auto;/,
);
assert.match(
  app,
  /isSuppressed:[\s\S]*activePage === "community" && communityTab === "funnel"/,
);
assert.match(memberAgentDock, /props\.isSuppressed \? " is-suppressed"/);
assert.match(
  memberAgentDockStyles,
  /\.member-agent-dock\.is-suppressed\s*\{[\s\S]*?display:\s*none;/,
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
assert.match(
  schema,
  /publishedDocumentV1:[\s\S]*publishedDraftRevision:[\s\S]*publishedByUserId:/,
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
assert.match(
  backend,
  /export const publishCommunityFunnelDraft = mutation[\s\S]*requireCommunityManager[\s\S]*expectedDraftRevision[\s\S]*community_funnel_publish_conflict/,
);
assert.match(
  backend,
  /publishedDocumentV1: draftDocumentV1[\s\S]*publishedDraftRevision: currentRevision/,
);
assert.match(
  gateway,
  /communityFunnel:publishCommunityFunnelDraft/,
);
assert.match(editor, /community_funnel_publish/);
assert.match(editor, /Publish funnel/);
assert.match(editor, /Intro video/);
assert.match(editor, /setCloudCommunityFunnelDraftVsl/);
assert.match(editor, /community_funnel_vsl_save/);
assert.doesNotMatch(editor, /Assets tab|asset library/i);
assert.match(
  backend,
  /export const setCommunityFunnelDraftVsl = mutation[\s\S]*requireCommunityManager[\s\S]*expectedDraftRevision[\s\S]*community_funnel_draft_conflict[\s\S]*normalizeCommunityFunnelVslUrl/,
);
assert.match(
  backend,
  /publishedVslUrl: resolveDraftVslUrl\(existing\)[\s\S]*publishedDocumentV1: draftDocumentV1|publishedDocumentV1: draftDocumentV1[\s\S]*publishedVslUrl: resolveDraftVslUrl\(existing\)/,
);
assert.match(gateway, /communityFunnel:setCommunityFunnelDraftVsl/);
assert.match(schema, /draftVslUrl:[\s\S]*publishedVslUrl:/);
assert.match(preview, /vslUrl\?: string \| null/);
assert.match(preview, /section\.type === "media"\) return null/);
assert.match(preview, /<PreviewMedia community=\{community\} vslUrl=\{props\.vslUrl\}/);

// Reference images reuse the canonical claimed-image pipeline. Only the active
// personal-agent episode or an authorized canonical manager funnel thread may
// prepare/claim an upload; the legacy raw-storage route is rejected for both.
assert.match(
  threads,
  /function isClaimedImageAttachmentThread[\s\S]*isGlobalMemberAgentEpisodeThreadKey[\s\S]*isCommunityFunnelThreadKeyForCommunity/,
);
assert.match(
  threads,
  /function requireWritableClaimedImageAttachmentThread[\s\S]*requireWritableMemberAgentThread[\s\S]*isCommunityFunnelThreadKeyForCommunity[\s\S]*requireCommunityManager/,
);
assert.equal(
  (threads.match(/requireWritableClaimedImageAttachmentThread\(\{/g) ?? [])
    .length,
  2,
  "both upload-ticket preparation and storage claim must share one authority boundary",
);
assert.match(
  threads,
  /generateCloudThreadAttachmentUploadUrl[\s\S]*isClaimedImageAttachmentThread\(thread\)[\s\S]*member_agent_attachment_upload_ticket_required/,
);
assert.match(
  threads,
  /normalizeMemberAgentMessageContent[\s\S]*isClaimedImageAttachmentThread\(args\.thread\)[\s\S]*member_agent_attachment_claim_required/,
);

const funnelDocumentSchema = POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_call
  .inputSchema.properties?.input as {
  properties?: { document?: { properties?: { sections?: unknown } } };
};
assert.doesNotMatch(
  JSON.stringify(funnelDocumentSchema.properties?.document?.properties?.sections),
  /media_url|"media"/,
  "the agent tool must not advertise creator-owned VSL authority",
);

// Runtime authority is scoped twice: canonical thread + manager lens, then one
// discoverable manager-only canonical operation.
assert.match(
  invocationSurface,
  /COMMUNITY_FUNNEL_BUILDER_TOOL_NAME_SET[\s\S]*"polynet_list"[\s\S]*"polynet_read"[\s\S]*"polynet_call"/,
);
const assembledFunnelPrompt = buildPlatformHarnessRuntimePromptBundle({
  loopBudget: {
    maxToolSteps: 4,
    maxRepeatedIdenticalCalls: 1,
    maxConsecutiveFailures: 2,
    maxNoProgressSteps: 2,
  },
  allowedToolNames: ["polynet_list", "polynet_read", "polynet_call"],
  harnessName: "chat_tools",
  runtimeTurnContext: buildRuntimeTurnContextPacket({}),
  invocationSurface: "community_funnel_builder",
  communityId: "community-proof",
  communityName: "Proof Community",
  communitySlug: "proof-community",
});
assert.equal(
  assembledFunnelPrompt.sections.find(
    (section) => section.id === "invocation_surface",
  )?.rendered,
  true,
  "the bounded funnel contract must render in the final runtime prompt bundle",
);
assert.match(assembledFunnelPrompt.text, /bounded community funnel composer/);
assert.match(assembledFunnelPrompt.text, /Never invent an audience, offer, price/);
assert.match(
  assembledFunnelPrompt.text,
  /saved intro video immediately after the hero/,
);
assert.match(
  assembledFunnelPrompt.text,
  /Do not default every funnel to a dark theme or rose accent/,
);
assert.match(
  assembledFunnelPrompt.text,
  /Never publish, change pricing, change access policy/,
);
assert.equal(
  assembledFunnelPrompt.sections.some(
    (section) => section.id === "member_identity_context",
  ),
  false,
  "the funnel surface must not inherit private member-dock identity context",
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
const funnelCallInput = POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_call
  .inputSchema.properties?.input as {
  properties?: Record<string, unknown>;
};
assert.ok(
  funnelCallInput.properties?.expected_revision,
  "polynet_call must expose the funnel draft revision inside operation input",
);
assert.ok(
  funnelCallInput.properties?.document,
  "polynet_call must expose the bounded Funnel V1 document inside operation input",
);
assert.equal(
  POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_call.inputSchema.properties
    ?.expected_revision,
  undefined,
  "polynet_call must not advertise a dead top-level revision field",
);
assert.doesNotMatch(
  contextIntegrity,
  /"community_feed_context"/,
  "runtime integrity must not require a retired feed prompt section",
);

// Preview is analytics-free and disabled. Live V1 reads only the explicit
// published snapshot; communities without one retain the V0 compatibility
// surface.
assert.match(previewController, /fetchCloudCommunityFunnelDraftPreview/);
assert.match(previewController, /setAccessState\("allowed"\)/);
assert.match(
  previewController,
  /classifyCommunityFunnelDraftPreviewFailure\(cause\) === "denied"/,
);
assert.match(previewController, /const retry = useCallback/);
assert.match(
  app,
  /const communityPreviewAccessState =[^;]*funnelDraftPreview\.accessState;/s,
);
assert.doesNotMatch(
  app,
  /const communityPreviewAccessState =[\s\S]{0,700}publicCommunityAccessResolutionKey/,
  "draft preview admission must not depend on the public-funnel access cache",
);
assert.match(
  app,
  /previewAdmissionError[\s\S]*funnelDraftPreview\.retry\(\)[\s\S]*Back to builder/,
);
assert.match(
  publicFunnel,
  /isPreviewMode && publicCommunity[\s\S]*CommunityFunnelV1Preview/,
);
assert.doesNotMatch(
  publicFunnel,
  /buildDefaultCommunityFunnelDocumentV1/,
  "full preview must render the private draft exactly, not synthesize a fallback page",
);
assert.match(preview, /Nothing to preview yet\./);
assert.match(preview, /Prompt the agent to build your funnel\./);
assert.match(publicFunnel, /return \([\s\S]*<WebCommunityVisitorSurface/);
assert.match(
  publicFunnel,
  /funnel\?\.published_document_v1[\s\S]*document=\{funnel\.published_document_v1\}[\s\S]*isPreview=\{false\}/,
);
assert.match(routeController, /recordVisit: !isPublicFunnelPreviewRoute/);
assert.match(preview, /disabled=\{isPreview \|\| props\.primaryActionDisabled\}/);
assert.match(preview, /onPrimaryAction/);
assert.match(
  documentContract,
  /DEFAULT_COMMUNITY_FUNNEL_THEME[\s\S]*accent: "blue"/,
);
assert.match(
  previewStyles,
  /--funnel-v1-accent: #72a7ff;[\s\S]*color-mix\(in srgb, var\(--funnel-v1-accent\) 9%, transparent\)/,
);
assert.match(
  previewStyles,
  /box-shadow:[\s\S]*color-mix\(in srgb, var\(--funnel-v1-accent\) 72%, transparent\)/,
);
assert.doesNotMatch(previewStyles, /rgba\(255,\s*59,\s*120/);

console.log(
  "PASS: Funnel V1 is an AI-assisted bounded draft composer with explicit manager-only revision-safe publication; preview stays disabled, published snapshots power live V1, and unpublished communities retain V0.",
);
