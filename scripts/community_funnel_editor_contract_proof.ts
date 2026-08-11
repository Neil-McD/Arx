import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POLYNET_CANONICAL_TOOL_DEFINITIONS } from "../shared/polynetCanonicalToolContract.ts";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

const read = (path: string) => readFileSync(path, "utf8");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const app = read("apps/web/src/App.tsx");
const memberAgentDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
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
const preview = read("apps/web/src/components/CommunityFunnelPreview.tsx");
const previewStyles = read(
  "apps/web/src/components/CommunityFunnelPreview.css",
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
const routeState = read("shared/webAppRouteState.ts");
const gateway = read("shared/cloudCommunityFunnelGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const documentContract = read("shared/communityFunnel.ts");
const funnelValidators = read("convex/communityFunnelValidators.ts");
const invocationSurface = read("shared/runtimeInvocationSurface.ts");
const contextIntegrity = read("shared/runtimeContextIntegrity.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");
const backend = read("convex/communityFunnel.ts");
const schema = read("convex/schema.ts");

assert.doesNotMatch(
  documentContract,
  /buildDefaultCommunityFunnelDocumentV1/,
  "production funnel contracts must not synthesize an authored default document",
);

// Product surface: one persistent conversation beside one trusted preview.
assert.match(editor, /buildCommunityFunnelThreadKey/);
assert.match(editor, /WebPlatformTabList/);
assert.match(editor, /Default[\s\S]*Funnel 1[\s\S]*Funnel 2/);
assert.match(editor, /selectedCustomSlot/);
assert.match(editor, /useWebTurnRunnerController/);
assert.match(editor, /invocationSurface: "community_funnel_builder"/);
assert.match(editor, /resolveAuthPresentationIdentity\(props\.session\)/);
assert.match(editor, /props\.ensureSession\(\s*sessionRef\.current,/);
assert.doesNotMatch(editor, /props\.previewCommunity\.name,\s*props\.session,/);
assert.doesNotMatch(editor, /uploadCloudThreadAttachmentFile/);
assert.match(editor, /CommunityFunnelPreview/);
assert.match(editor, /fetchCloudPublicFunnelStats/);
assert.match(editor, /community_funnel_member_proof_load_failed/);
assert.match(editor, /community={hydratedPreviewCommunity}/);
assert.match(editor, /primaryActionLabel={props\.previewPrimaryActionLabel}/);
assert.doesNotMatch(editor, /buildDefaultCommunityFunnelDocumentV1/);
assert.match(
  editor,
  /const content = selectedVariant\?\.draft_content_v2 \?\? null;/,
);
assert.match(
  editor,
  /disabled=\{isBusy \|\| \(selectedSlot !== "default" && !content\)\}/,
);
assert.match(
  editor,
  /selectedSlot === "default" \? \([\s\S]*deterministicContent[\s\S]*\) : content \? \(/,
);
assert.match(editor, /Nothing to preview yet\./);
assert.match(editor, /Prompt the agent to build your funnel\./);
assert.doesNotMatch(
  editor,
  /Save draft|Headline[\s\S]*Subheadline|custom html|custom css|script/i,
);
assert.match(preview, /buildCommunityFunnelMemberProofView/);
assert.doesNotMatch(preview, /resolveCommunityFunnelMemberProofInsertIndex/);
assert.doesNotMatch(preview, /automaticMemberProofInsertIndex/);
assert.match(preview, /<MemberAvatarStack/);
assert.doesNotMatch(preview, /<img key=\{face\.user_id\}/);
assert.match(preview, /renderBrand\(true\)/);
assert.match(preview, /className="community-funnel-member-proof-row"/);
assert.doesNotMatch(preview, /section\.type|social_proof|testimonial|faq/);
assert.match(
  preview,
  /community-funnel-long-form[\s\S]*community-funnel-final-conversion[\s\S]*renderMemberProof\(\)[\s\S]*renderPrimaryAction\("final"\)/,
);
assert.equal(
  preview.match(/renderPrimaryAction\("first"\)/g)?.length,
  2,
  "default and custom funnels must each use the canonical first action",
);
assert.match(
  previewStyles,
  /\.community-funnel-brand\.is-default[\s\S]*\.community-funnel-default-hero h1[\s\S]*\.community-funnel-conversion-spine\.is-default/,
  "the deterministic fallback must retain the selected centered-cover hierarchy",
);
assert.match(
  previewStyles,
  /\.community-funnel-canonical-action button \{[\s\S]*background: var\(--accent-selection\);[\s\S]*color: var\(--bg-button-text\);/,
  "the deterministic fallback action must inherit the canonical Dark and Light selection palette",
);
assert.doesNotMatch(
  previewStyles,
  /\.community-funnel-member-proof-copy|\.community-funnel-member-proof\s*\{/,
  "the deterministic fallback must not restore the legacy bordered member-proof card",
);
assert.doesNotMatch(previewStyles, /accent-(?:violet|rose|amber|emerald)|density-(?:compact|airy)|radius-subtle/);

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

// The model produces bounded conversion content, never page structure or code.
assert.match(documentContract, /validateCommunityFunnelContentV2/);
assert.match(documentContract, /rawPillars\.length !== 3/);
assert.match(
  schema,
  /draftContentV2:[\s\S]*draftRevision:[\s\S]*draftUpdatedByUserId:/,
);
assert.match(
  schema,
  /publishedContentV2:[\s\S]*publishedDraftRevision:[\s\S]*publishedByUserId:/,
);
assert.match(
  schema,
  /activeFunnelSlot:[\s\S]*v\.literal\("default"\)[\s\S]*v\.literal\("custom_1"\)[\s\S]*v\.literal\("custom_2"\)/,
);
assert.match(
  schema,
  /communityFunnels:[\s\S]*slot:[\s\S]*v\.literal\("custom_1"\)[\s\S]*v\.literal\("custom_2"\)/,
);

// Storage remains manager-authorized and revision-safe.
assert.match(
  backend,
  /requireCommunityManager[\s\S]*expectedDraftRevision[\s\S]*community_funnel_draft_conflict/,
);
assert.match(backend, /validateCommunityFunnelContentV2/);
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
  /publishedContentV2: draftContentV2[\s\S]*publishedDraftRevision: currentRevision/,
);
assert.match(gateway, /communityFunnel:publishCommunityFunnelDraft/);
assert.match(backend, /export const setActiveCommunityFunnel = mutation/);
assert.match(backend, /community_funnel_activation_requires_published/);
assert.match(backend, /expectedPublishedDraftRevision/);
assert.match(backend, /community_funnel_activation_conflict/);
assert.match(gateway, /communityFunnel:setActiveCommunityFunnel/);
assert.match(
  communityTypes,
  /CommunityFunnelActivationTarget[\s\S]*slot: "default"[\s\S]*expectedPublishedDraftRevision: number/,
);
assert.match(
  gateway,
  /target: CommunityFunnelActivationTarget[\s\S]*target: params\.target/,
);
assert.match(editor, /community_funnel_publish/);
assert.match(editor, /Publish changes/);
assert.match(editor, /Make live/);
assert.match(
  editor,
  /Built automatically from your community profile\. Always available\./,
);
assert.match(
  editor,
  /Describe what you want\. Changes stay private until you publish\./,
);
assert.match(editor, /className="funnel-builder-conversation"/);
assert.match(
  editor,
  /\{selectedCustomSlot \? \([\s\S]*?<aside[\s\S]*?className="funnel-builder-conversation"/,
);
assert.doesNotMatch(editor, /funnel-builder-default-guidance/);
assert.doesNotMatch(editor, /funnel-builder-live-state/);
assert.match(
  editor,
  /if \(!isPublishedCurrentDraft\) return "Draft";[\s\S]*?params\.slot === params\.activeSlot \? "Live" : "Published"/,
);
assert.match(communityStyles, /\.funnel-builder-layout\.is-default\s*\{/);
assert.match(
  communityStyles,
  /\.funnel-builder-layout\.is-default \.community-funnel-preview\s*\{[\s\S]*?width:\s*min\(920px, 100%\)/,
);
assert.match(editor, /Video Sales Letter/);
assert.match(
  editor,
  /publishCloudCommunityFunnelDraft<[\s\S]*slot: selectedCustomSlot/,
);
assert.match(
  editor,
  /setCloudCommunityFunnelDraftVsl<[\s\S]*slot: selectedCustomSlot/,
);
assert.match(editor, /setCloudActiveCommunityFunnel</);
assert.match(editor, /expectedPublishedDraftRevision:/);
assert.match(editor, /community_funnel_activation_conflict_refresh/);
assert.match(
  editor,
  /This funnel changed elsewhere\. Review it before making it live\./,
);
assert.match(editor, /selectedSlot === "default"[\s\S]*deterministicContent/);
assert.match(
  previewController,
  /params\.slot === "default"[\s\S]*config\.custom_funnels\[params\.slot\]/,
);
assert.match(
  routeState,
  /community_funnel_preview[\s\S]*slot: CommunityFunnelSlot/,
);
assert.match(editor, /setCloudCommunityFunnelDraftVsl/);
assert.match(editor, /community_funnel_vsl_save/);
assert.doesNotMatch(editor, /Assets tab|asset library/i);
assert.match(
  backend,
  /export const setCommunityFunnelDraftVsl = mutation[\s\S]*requireCommunityManager[\s\S]*expectedDraftRevision[\s\S]*community_funnel_draft_conflict[\s\S]*normalizeCommunityFunnelVslUrl/,
);
assert.match(
  backend,
  /publishedVslUrl: resolveDraftVslUrl\(existing\)[\s\S]*publishedContentV2: draftContentV2|publishedContentV2: draftContentV2[\s\S]*publishedVslUrl: resolveDraftVslUrl\(existing\)/,
);
assert.match(gateway, /communityFunnel:setCommunityFunnelDraftVsl/);
assert.match(schema, /draftVslUrl:[\s\S]*publishedVslUrl:/);
assert.match(preview, /vslUrl\?: string \| null/);
assert.doesNotMatch(preview, /section\.type === "media"/);
assert.match(
  preview,
  /<PreviewMedia community=\{community\} vslUrl=\{props\.vslUrl\}/,
);

const funnelContentSchema = POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_call
  .inputSchema.properties?.input as {
  properties?: { content?: { properties?: Record<string, unknown> } };
};
assert.doesNotMatch(
  JSON.stringify(funnelContentSchema.properties?.content),
  /theme|appearance|accent|density|radius|media|testimonial|faq|cta/i,
  "the agent tool must expose content only, never layout, VSL, proof, or CTA authority",
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
assert.match(
  assembledFunnelPrompt.text,
  /Never invent an audience, offer, price/,
);
assert.match(
  assembledFunnelPrompt.text,
  /Video Sales Letter placement, both canonical join actions/,
);
assert.match(assembledFunnelPrompt.text, /exactly three concise benefit pillars/);
assert.match(
  assembledFunnelPrompt.text,
  /Polynet owns the page structure, application theme/,
);
assert.match(
  assembledFunnelPrompt.text,
  /Never propose custom HTML, CSS, JavaScript, external hosting, theme tokens/,
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
assert.match(runtimeResolution, /resolveCommunityFunnelThreadSlotForCommunity/);
assert.match(
  runtimeResolution,
  /community_funnel_builder[\s\S]*!runtimeCommunityFunnelSlot/,
);
assert.match(
  runtimeTurnHandlers,
  /communityFunnelSlot: runtimeCommunityFunnelSlot/,
);
assert.match(
  runtimeAgentLoop,
  /funnelDraftSlot: params\.communityFunnelSlot \?\? null/,
);
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
assert.match(canonicalExecutor, /slot: funnelDraftSlot/);
assert.match(
  canonicalExecutor,
  /community-funnel:\$\{funnelDraftSlot\}:\$\{idempotencyKey\}/,
);
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
  funnelCallInput.properties?.content,
  "polynet_call must expose bounded Funnel V2 content inside operation input",
);
const funnelContentInput = funnelCallInput.properties?.content as {
  properties?: Record<string, unknown>;
};
assert.deepEqual(
  (funnelContentInput.properties?.pillars as { minItems?: number; maxItems?: number }),
  {
    type: "array",
    minItems: 3,
    maxItems: 3,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 90 },
        body: { type: "string", minLength: 1, maxLength: 320 },
      },
    },
  },
  "the funnel agent must provide exactly three bounded pillars",
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

// Preview is analytics-free and disabled. Live custom funnels read only the
// explicit V2 publication snapshot; all others use the deterministic default.
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
  /isPreviewMode && publicCommunity[\s\S]*CommunityFunnelPreview/,
);
assert.match(
  publicFunnel,
  /className="funnel-preview-presentation"[\s\S]*className="funnel-preview-back"[\s\S]*href=\{props\.previewExitPath \?\? "\/discover"\}/,
  "private preview must own its full-canvas presentation and native builder return link",
);
assert.match(
  previewStyles,
  /\.funnel-preview-presentation \{[\s\S]*height: 100%;[\s\S]*overflow: hidden;[\s\S]*\.funnel-preview-back \{[\s\S]*position: absolute;/,
  "preview chrome must remain fixed while only funnel content scrolls",
);
assert.doesNotMatch(
  publicFunnel,
  /buildDefaultCommunityFunnelDocumentV1/,
  "full preview must render the private draft exactly, not synthesize a fallback page",
);
assert.match(preview, /Nothing to preview yet\./);
assert.match(preview, /Prompt the agent to write your funnel\./);
assert.doesNotMatch(publicFunnel, /WebCommunityVisitorSurface/);
assert.match(
  publicFunnel,
  /content=\{null\}[\s\S]*deterministicContent=\{\{[\s\S]*headline: publicCommunity\.one_liner\?\.trim\(\) \|\| communityName,[\s\S]*body: publicCommunity\.about\?\.trim\(\) \|\| null/,
  "unpublished communities must render only canonical deterministic content",
);
assert.match(publicFunnel, /buildCommunityFunnelPrimaryActionView/);
assert.doesNotMatch(publicFunnel, /formatCtaPriceLabel|Join now/);
assert.match(
  publicFunnel,
  /funnel\?\.published_content_v2[\s\S]*content=\{funnel\.published_content_v2\}[\s\S]*isPreview=\{false\}/,
);
assert.match(routeController, /recordVisit: !isPublicFunnelPreviewRoute/);
assert.match(
  preview,
  /disabled=\{isPreview \|\| props\.primaryActionDisabled\}/,
);
assert.match(preview, /onPrimaryAction/);
assert.match(
  documentContract,
  /DEFAULT_COMMUNITY_FUNNEL_THEME[\s\S]*appearance: "inherit"[\s\S]*accent: "blue"/,
);
assert.match(
  funnelValidators,
  /appearance: v\.union\([\s\S]*v\.literal\("inherit"\)[\s\S]*v\.literal\("light"\)[\s\S]*v\.literal\("dark"\)/,
  "legacy published snapshots must remain schema-readable while canonical writes inherit",
);
assert.match(
  previewStyles,
  /--community-funnel-accent: var\(--accent-attention\);[\s\S]*--community-funnel-page: var\(--surface-app\);/,
);
assert.match(
  previewStyles,
  /box-shadow:[\s\S]*color-mix\(in srgb, var\(--community-funnel-accent\) 72%, transparent\)/,
);
assert.doesNotMatch(previewStyles, /rgba\(255,\s*59,\s*120/);
assert.doesNotMatch(preview, /theme\.appearance|theme\.accent|theme\.density|theme\.radius/);
assert.doesNotMatch(previewStyles, /\.community-funnel-preview\.is-light/);

console.log(
  "PASS: Funnel V2 fixes page structure in Polynet while private AI content drafts, publication, activation, VSL, pricing, access, and canonical actions remain separately authoritative.",
);
