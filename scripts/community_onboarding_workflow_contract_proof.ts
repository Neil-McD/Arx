import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  buildCommunityOnboardingIntroductionDraft,
  buildCommunityOnboardingMilestonePatch,
  deriveCommunityOnboardingPhase,
  isCommunityOnboardingIntroductionReady,
  normalizeCommunityOnboardingVideoUrl,
  shouldPresentCommunityOnboardingAgentReview,
  shouldPresentCommunityOnboardingAgentStep,
  shouldPresentCommunityOnboardingFirstPost,
  shouldPresentCommunityOnboardingMcpHandoff,
  shouldPresentCommunityOnboardingOrientation,
  type CommunityOnboardingMilestone,
  type CommunityOnboardingMilestoneRow,
} from "../shared/communityOnboarding.ts";
import { buildCommunityOnboardingCopy } from "../shared/communityOnboardingCopy.ts";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("convex/schema.ts");
const lifecycle = read("convex/communityMembershipLifecycle.ts");
const core = read("convex/communityOnboardingCore.ts");
const onboarding = read("convex/communityOnboarding.ts");
const onboardingCopy = read("shared/communityOnboardingCopy.ts");
const onboardingShared = read("shared/communityOnboarding.ts");
const onboardingGateway = read("shared/cloudCommunityOnboardingGateway.ts");
const interactions = read("convex/communityInteractions.ts");
const concierge = read("convex/communityAgentConciergeCore.ts");
const conciergeWorker = read("convex/communityAgentServeWorker.ts");
const runtime = read("convex/runtimeTurnHandlers.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const runtimeManifest = read("shared/runtimeContextManifest.ts");
const workflowUi = read("apps/web/src/components/WebCommunityOnboardingWorkflowSection.tsx");
const controller = read("apps/web/src/components/WebCommunityOnboardingController.tsx");
const orientation = read("apps/web/src/components/WebCommunityOnboardingOrientationSurface.tsx");
const firstPost = read("apps/web/src/components/WebCommunityOnboardingConciergeGuide.tsx");
const agentGuide = read("apps/web/src/components/WebCommunityOnboardingAgentGuide.tsx");
const conciergeSurface = read("apps/web/src/components/WebCommunityOnboardingConciergeSurface.tsx");
const chat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const communitySurfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const dockCss = read("apps/web/src/components/WebMemberAgentDock.css");
const mcpGuide = read("apps/web/src/components/WebCommunityOnboardingMcpGuide.tsx");
const mcpCompatibility = read("apps/web/src/components/WebCommunityOnboardingMcpCompatibility.tsx");
const integrations = read("apps/web/src/components/WebIntegrationsSettingsSection.tsx");
const mcpSetup = read("shared/polynetMcpSetup.ts");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");

function tableSource(name: string, nextName: string): string {
  const start = schema.indexOf(`${name}: defineTable`);
  const end = schema.indexOf(`${nextName}: defineTable`, start);
  assert.ok(start >= 0 && end > start, `${name} schema slice must exist`);
  return schema.slice(start, end);
}

function advance(
  session: CommunityOnboardingMilestoneRow,
  milestone: CommunityOnboardingMilestone,
  nowMs: number,
): CommunityOnboardingMilestoneRow {
  return { ...session, ...(buildCommunityOnboardingMilestonePatch(session, milestone, nowMs) ?? {}) };
}

assert.equal(normalizeCommunityOnboardingVideoUrl("https://example.com/welcome"), "https://example.com/welcome");
assert.equal(normalizeCommunityOnboardingVideoUrl("javascript:alert(1)"), null);
assert.equal(buildCommunityOnboardingIntroductionDraft({ displayName: "Neil McDevitt" }), "Hi, I’m Neil. I joined because ");
assert.equal(isCommunityOnboardingIntroductionReady({ text: "Hi, I’m Neil. I joined because ", seededDraft: "Hi, I’m Neil. I joined because " }), false);
assert.equal(isCommunityOnboardingIntroductionReady({ text: "Hi, I’m Neil. I joined because building together.", seededDraft: "Hi, I’m Neil. I joined because " }), true);
const orientationFallback = buildCommunityOnboardingCopy({
  cue: "orientation",
  communityName: "Polynet",
  hasVideo: true,
});
assert.equal(
  orientationFallback,
  [
    "Welcome to Polynet.",
    "I’m your community concierge. I’ll help you get oriented and take your first steps here.",
    "Start with this short welcome from the founder. When you’re finished, I’ll help you introduce yourself to the community.",
  ].join("\n\n"),
);
assert.doesNotMatch(orientationFallback, /Collective intelligence for communities/);
assert.equal(
  buildCommunityOnboardingCopy({
    cue: "orientation",
    communityName: "Polynet",
    hasVideo: false,
  }),
  [
    "Welcome to Polynet.",
    "I’m your community concierge. I’ll help you get oriented and take your first steps here.",
    "Let’s begin with a quick introduction so the community can get to know you.",
  ].join("\n\n"),
);
assert.match(buildCommunityOnboardingCopy({
  cue: "community_composer",
  communityName: "Polynet",
  hasVideo: false,
}), /introduce you to Polynet/);
assert.match(buildCommunityOnboardingCopy({
  cue: "personal_agent_intro",
  communityName: "Polynet",
  hasVideo: false,
}), /personal agent/);
assert.match(buildCommunityOnboardingCopy({
  cue: "personal_agent_review",
  communityName: "Polynet",
  hasVideo: false,
}), /has answered/);
assert.match(buildCommunityOnboardingCopy({
  cue: "mcp_handoff",
  communityName: "Polynet",
  hasVideo: false,
}), /Take Polynet with you/);

let session: CommunityOnboardingMilestoneRow = { status: "active" };
assert.equal(deriveCommunityOnboardingPhase(session), "orientation");
assert.equal(shouldPresentCommunityOnboardingOrientation({ status: "active", phase: "orientation" }), true);
session = advance(session, "orientation_completed", 10);
assert.equal(deriveCommunityOnboardingPhase(session), "first_community_post");
session = advance(session, "orientation_completed", 20);
assert.equal(session.orientationCompletedAt, 10, "milestones must be idempotent");
session = advance(session, "first_community_post", 30);
assert.equal(shouldPresentCommunityOnboardingFirstPost({ status: "active", phase: deriveCommunityOnboardingPhase(session) }), false);
assert.equal(deriveCommunityOnboardingPhase(session), "first_agent_dock_turn");
assert.equal(shouldPresentCommunityOnboardingAgentStep({ status: "active", phase: "first_agent_dock_turn" }), true);
session = advance(session, "first_agent_dock_turn", 40);
assert.equal(session.status, "active");
assert.equal(deriveCommunityOnboardingPhase(session), "agent_turn_review");
assert.equal(shouldPresentCommunityOnboardingAgentReview({ status: "active", phase: "agent_turn_review" }), true);
session = advance(session, "agent_turn_acknowledged", 50);
assert.equal(session.status, "active");
assert.equal(deriveCommunityOnboardingPhase(session), "mcp_handoff");
assert.equal(shouldPresentCommunityOnboardingMcpHandoff({ status: "active", phase: "mcp_handoff" }), true);
session = advance(session, "mcp_handoff_completed", 60);
assert.equal(session.status, "completed");
assert.equal(session.completedAt, 60);
assert.equal(buildCommunityOnboardingMilestonePatch(session, "first_community_post", 70), null);
assert.equal(deriveCommunityOnboardingPhase({ completedAt: 40 }), "complete");

const configSchema = tableSource("communityOnboardingConfigs", "communityOnboardingSessions");
const sessionSchema = tableSource("communityOnboardingSessions", "communityPresence");
assert.match(configSchema, /enabled: v\.boolean\(\)/);
assert.match(configSchema, /introVideoUrl: v\.optional\(v\.string\(\)\)/);
assert.doesNotMatch(configSchema, /welcomeMessage|agentInstructions|version:/);
assert.match(sessionSchema, /membershipId: v\.id\("communityMemberships"\)/);
assert.match(sessionSchema, /activationSequence: v\.number\(\)/);
assert.doesNotMatch(sessionSchema, /conciergeNarrations/);
assert.doesNotMatch(schema, /communityOnboardingConciergeNarrationValidator/);
assert.match(sessionSchema, /agentTurnAcknowledgedAt: v\.optional\(v\.number\(\)\)/);
assert.match(sessionSchema, /mcpHandoffCompletedAt: v\.optional\(v\.number\(\)\)/);
assert.doesNotMatch(
  sessionSchema,
  /welcomeMessageSnapshot|agentInstructions|configVersion|Seed|openedAt|v\.literal\("queued"\)|fallbackDeadlineAt/,
);
assert.doesNotMatch(schema, /communityOnboardingConciergeNotes: defineTable/);

for (const file of readdirSync("convex").filter(
  (name) =>
    name.endsWith(".ts") &&
    !name.endsWith(".test.ts") &&
    !name.endsWith(".spec.ts"),
)) {
  if (file === "communityMembershipLifecycle.ts") continue;
  assert.doesNotMatch(read(`convex/${file}`), /insert\("communityMemberships"[\s\S]{0,500}active:\s*true/);
}
assert.match(lifecycle, /createCommunityOnboardingSessionForActivation/);
assert.doesNotMatch(lifecycle, /scheduler|communityOnboardingConcierge|fallbackDeadlineAt/);
assert.match(core, /by_membership_activation/);
assert.match(core, /status: "superseded"/);
assert.doesNotMatch(core, /conciergeNarrations|communityOnboardingConcierge|buildCommunityOnboardingCopy/);
assert.doesNotMatch(core, /status: "idle"|status: "queued"|fallbackDeadlineAt|scheduler/);
assert.doesNotMatch(core, /agentInstructions|readCanonicalCommunityAgentContext/);
assert.match(onboarding, /completeMyCommunityOnboardingOrientation/);
assert.match(onboarding, /recordPersonalAgentDockTurnInternal/);
assert.match(onboarding, /acknowledgeMyCommunityOnboardingAgentTurn/);
assert.match(onboarding, /milestone: "agent_turn_acknowledged"/);
assert.match(onboarding, /completeMyCommunityOnboardingMcpHandoff/);
assert.match(onboarding, /milestone: "mcp_handoff_completed"/);
assert.doesNotMatch(onboarding, /openMyCommunityOnboardingSession|resolveActivePersonalAgentGuidance|ensureCommunityAgentDockWelcomeCore/);
assert.match(interactions, /milestone: "first_community_post"/);
assert.doesNotMatch(interactions, /onboardingPreview|onboardingMode|onboardingSessionId/);
assert.doesNotMatch(concierge, /onboardingMode|onboardingSessionId/);
assert.doesNotMatch(conciergeWorker, /ONBOARDING_ORIENTATION|communityOnboarding|onboardingMode/);
assert.equal(existsSync("convex/communityOnboardingConcierge.ts"), false);
assert.equal(existsSync("shared/communityOnboardingConcierge.ts"), false);
assert.match(onboardingCopy, /I’m your community concierge/);
assert.doesNotMatch(onboardingCopy, /prompt|model|provider|completion|inference/i);
assert.doesNotMatch(onboarding, /conciergeNarrations|concierge_narrations/);
assert.match(runtime, /recordCommunityOnboardingAgentDockTurnBestEffort/);
assert.doesNotMatch(runtimeResolution, /communityOnboarding|member_agent_mode/);
assert.doesNotMatch(runtimePrompt, /MEMBER_ONBOARDING_GUIDANCE|community_onboarding_guidance/);
assert.doesNotMatch(runtimeManifest, /community_onboarding_guidance/);

assert.match(workflowUi, /New member onboarding/);
assert.match(workflowUi, /Founder welcome video/);
assert.match(workflowUi, /Paste a YouTube link/);
assert.match(workflowUi, /INLINE_PREVIEW_STEPS/);
assert.match(workflowUi, /community-onboarding-preview-steps/);
assert.match(workflowUi, /buildPlatformSwitcherStyle/);
assert.match(workflowUi, /disabled=\{!enabled \|\| isSaving \|\| isDirty\}/);
assert.match(workflowUi, /\{enabled \? \(/);
assert.match(
  workflowUi,
  /export const WebCommunityOnboardingWorkflowSection = memo\(/,
  "background community-shell polling must not rerender the workflow when its direct inputs are unchanged",
);
assert.match(workflowUi, /const sessionRef = useRef\(props\.session\)/);
assert.match(workflowUi, /sessionRef\.current = props\.session/);
assert.match(
  workflowUi,
  /configRef\.current &&\s+configCommunityIdRef\.current === props\.communityId/,
  "a loaded workflow must ignore unrelated shell and auth-session updates",
);
assert.match(
  workflowUi,
  /const usableSession = await props\.ensureSession\(props\.session\);[\s\S]*?fetchCloudCommunityOnboardingConfig\(\{\s+session: usableSession,\s+communityId: props\.communityId,/,
  "workflow configuration loading must refresh authentication before querying Convex",
);
assert.doesNotMatch(
  workflowUi,
  /loadAttempt|setLoadAttempt|>\s*Retry\s*</,
  "workflow configuration should not retain the temporary manual recovery control",
);
assert.match(
  workflowUi,
  /const isLoading = !hasCurrentConfig && error === null/,
  "background session recovery must preserve already-loaded workflow UI",
);
assert.match(
  workflowUi,
  /const usableSession = await props\.ensureSession\(sessionRef\.current\);[\s\S]*?saveCloudCommunityOnboardingConfig\(\{\s+session: usableSession,/,
  "workflow configuration saves must refresh authentication before mutating Convex",
);
assert.match(
  baseCss,
  /\.community-onboarding-inline-preview-frame > \.community-onboarding-orientation-inline/,
);
assert.match(
  baseCss,
  /\.community-onboarding-orientation-inline \.community-onboarding-orientation-media/,
);
assert.match(baseCss, /box-sizing: border-box;\s+width: 100%;\s+max-width: 100%;\s+min-width: 0;/);
assert.match(
  baseCss,
  /\.community-onboarding-live-preview \{\s+width: 100%;\s+max-width: 620px;/,
);
assert.match(
  baseCss,
  /\.community-onboarding-inline-preview-frame \{[\s\S]*?max-height: 360px;/,
);
assert.match(
  baseCss,
  /height: clamp\(130px, 18cqi, 160px\);\s+aspect-ratio: auto;/,
);
assert.doesNotMatch(
  workflowUi,
  /Run for new members|community-onboarding-journey|Member view|Welcome new members/,
);
assert.doesNotMatch(workflowUi, /welcomeMessage|welcome_message|Concierge welcome guidance|agent instructions/i);
assert.match(controller, /subscribeCloudCommunityOnboardingSession/);
assert.doesNotMatch(controller, /requestCloudCommunityOnboardingConciergeNarration/);
assert.doesNotMatch(controller, /generateCloudCommunityOnboardingConciergePreview/);
assert.doesNotMatch(controller, /CONCIERGE_NARRATION_REQUEST_RETRY_MS/);
assert.doesNotMatch(controller, /narrationRequest|preparingNarrationCue/);
assert.doesNotMatch(controller, /communityOnboardingConciergeCueForPhase|concierge_narrations/);
assert.doesNotMatch(controller, /sendCloudCommunityAgentDockMessage|subscribeCloudCommunityAgentDockTranscript|openCloudCommunityOnboardingSession/);
assert.match(orientation, /buildCommunityOnboardingCopy/);
assert.doesNotMatch(orientation, /concierge_narrations|communityOneLiner|isPreparing/);
assert.match(onboardingCopy, /Start with this short welcome from the founder/);
assert.match(onboardingCopy, /Let’s begin with a quick introduction/);
assert.match(orientation, /WebCommunityOnboardingConciergeSurface/);
assert.doesNotMatch(orientation, /textarea|onSubmit/);
assert.doesNotMatch(firstPost, /props\.narration|isPreparing/);
assert.match(firstPost, /buildCommunityOnboardingCopy/);
assert.doesNotMatch(
  firstPost,
  /Your introduction is live|That’s a strong introduction|Preview sends are simulated/,
);
assert.match(agentGuide, /WebCommunityOnboardingConciergeSurface/);
assert.match(agentGuide, /Step 3 of 4/);
assert.doesNotMatch(agentGuide, /props\.narration|isPreparing/);
assert.match(agentGuide, /buildCommunityOnboardingCopy/);
assert.match(agentGuide, /personal_agent_review/);
assert.match(agentGuide, /personal_agent_intro/);
assert.match(agentGuide, /showPrimary=\{props\.isComplete\}/);
assert.doesNotMatch(
  agentGuide,
  /Your agent has answered|This is your personal agent\. It already understands/,
);
assert.match(agentGuide, /communityAvatarUrl/);
assert.match(conciergeSurface, /Community concierge/);
assert.match(conciergeSurface, /useDeterministicConciergeTranscript/);
assert.match(conciergeSurface, /prefers-reduced-motion: reduce/);
assert.match(conciergeSurface, /aria-live="polite"/);
assert.match(conciergeSurface, /renderMarkdown\(displayText\)/);
assert.doesNotMatch(conciergeSurface, /community concierge is thinking|isPreparing|allowActionsWhilePreparing/i);
assert.match(communitySurfaceProjection, /avatar_url: params\.activeCommunity\.avatar_url \?\? null/);
assert.match(communitySurfaceProjection, /avatar_focus_x: params\.activeCommunity\.avatar_focus_x \?\? null/);
assert.match(chat, /buildCommunityOnboardingIntroductionDraft/);
assert.match(dock, /shouldPresentCommunityOnboardingAgentStep/);
assert.match(dock, /shouldPresentCommunityOnboardingAgentReview/);
assert.match(dock, /requestedFundingSource: "auto"/);
assert.match(dock, /What is one useful first action I should take in/);
assert.match(dock, /disabled=\{showOnboardingAgentFocus\}/);
assert.doesNotMatch(dockCss, /member-agent-dock-header::after/);
assert.doesNotMatch(dockCss, /member-agent-dock-transcript::after/);
assert.match(dockCss, /member-agent-dock\.is-onboarding \.member-agent-dock-panel/);
assert.match(mcpGuide, /buildPolynetMcpSetupForOrigin\(window\.location\.origin\)/);
assert.match(mcpGuide, /setup\.setupBundle/);
assert.match(mcpGuide, /OAuth protected/);
assert.doesNotMatch(mcpGuide, /Polynet tools/);
assert.match(mcpGuide, /DiscoverCatalogLogo/);
assert.match(mcpGuide, /WebCommunityOnboardingConciergeSurface/);
assert.doesNotMatch(mcpGuide, /props\.narration|isPreparing/);
assert.match(mcpGuide, /buildCommunityOnboardingCopy/);
assert.match(mcpGuide, /community-onboarding-mcp-product-card/);
assert.match(mcpGuide, /Copy MCP setup/);
assert.match(mcpGuide, /Go to your harness and paste the setup into the chat/);
assert.match(mcpGuide, /WebCommunityOnboardingMcpCompatibility/);
assert.match(workflowUi, /WebCommunityOnboardingMcpCompatibility/);
assert.match(mcpCompatibility, /Compatible AI harnesses/);
assert.match(mcpCompatibility, /Codex/);
assert.match(mcpCompatibility, /Claude Code/);
assert.match(mcpCompatibility, /OpenClaw/);
assert.match(mcpCompatibility, /Hermes/);
assert.match(mcpCompatibility, /other MCP clients/);
for (const asset of [
  "apps/web/public/harness-logos/codex.svg",
  "apps/web/public/harness-logos/claude-code.svg",
  "apps/web/public/harness-logos/openclaw.svg",
  "apps/web/public/harness-logos/hermes.png",
]) {
  assert.ok(existsSync(asset), `${asset} must exist`);
}
assert.doesNotMatch(mcpGuide, /POLYNET_MCP_ENDPOINT_URL/);
assert.match(mcpGuide, /props\.onComplete/);
assert.match(integrations, /buildPolynetMcpSetupForOrigin\(window\.location\.origin\)/);
assert.match(integrations, /setup\.setupBundle/);
assert.doesNotMatch(integrations, /Polynet tools/);
assert.match(mcpSetup, /POLYNET_PRODUCTION_HOSTS = new Set\(\["polynet\.ai", "www\.polynet\.ai"\]\)/);
assert.match(mcpSetup, /POLYNET_STAGING_HOST = "polynet-staging\.vercel\.app"/);
assert.match(mcpSetup, /POLYNET_MCP_PATH = "\/runtime\/mcp"/);
assert.doesNotMatch(mcpGuide, /access token|bearer token/i);
assert.doesNotMatch(onboardingGateway, /communityOnboardingConcierge:/);
assert.doesNotMatch(onboardingShared, /prompt_version|resolved_model_id|failure_code|requested_at/);

console.log("PASS: onboarding uses one deterministic four-step projection, preserves the real personal-agent turn, and has no web concierge-inference dependency.");
