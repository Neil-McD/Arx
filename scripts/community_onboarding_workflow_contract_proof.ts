import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
import {
  buildCommunityOnboardingOrientationFallback,
  buildCommunityOnboardingOrientationMessages,
  normalizeCommunityOnboardingOrientationOutput,
} from "../shared/communityOnboardingConcierge.ts";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("convex/schema.ts");
const lifecycle = read("convex/communityMembershipLifecycle.ts");
const core = read("convex/communityOnboardingCore.ts");
const onboarding = read("convex/communityOnboarding.ts");
const onboardingConcierge = read("convex/communityOnboardingConcierge.ts");
const onboardingConciergeShared = read("shared/communityOnboardingConcierge.ts");
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
const integrations = read("apps/web/src/components/WebIntegrationsSettingsSection.tsx");
const mcpSetup = read("shared/polynetMcpSetup.ts");

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
assert.match(buildCommunityOnboardingOrientationFallback({
  communityName: "Polynet",
  communityOneLiner: "Collective intelligence for communities",
  welcomeMessage: "Start by meeting the room.",
  hasVideo: true,
}), /Watch it below/);
assert.equal(normalizeCommunityOnboardingOrientationOutput("Visit https://example.com"), null);
assert.equal(normalizeCommunityOnboardingOrientationOutput("Welcome to Polynet.\n\nLet’s get oriented."), "Welcome to Polynet.\n\nLet’s get oriented.");
const orientationMessages = buildCommunityOnboardingOrientationMessages({
  agentDisplayName: "Polynet",
  communityName: "Polynet",
  founderWelcome: "Welcome builders.",
  hasVideo: false,
});
assert.match(orientationMessages[0]?.content ?? "", /narration only/);
assert.match(orientationMessages[0]?.content ?? "", /Do not include URLs/);

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
assert.match(configSchema, /welcomeMessage: v\.string\(\)/);
assert.match(configSchema, /introVideoUrl: v\.optional\(v\.string\(\)\)/);
assert.doesNotMatch(configSchema, /agentInstructions|version:/);
assert.match(sessionSchema, /membershipId: v\.id\("communityMemberships"\)/);
assert.match(sessionSchema, /activationSequence: v\.number\(\)/);
assert.match(sessionSchema, /welcomeMessageSnapshot: v\.string\(\)/);
assert.match(sessionSchema, /conciergeNarration: v\.optional\(v\.object/);
assert.match(sessionSchema, /v\.literal\("fallback"\)/);
assert.match(sessionSchema, /v\.literal\("idle"\)/);
assert.match(sessionSchema, /agentTurnAcknowledgedAt: v\.optional\(v\.number\(\)\)/);
assert.match(sessionSchema, /mcpHandoffCompletedAt: v\.optional\(v\.number\(\)\)/);
assert.doesNotMatch(
  sessionSchema,
  /agentInstructions|configVersion|Seed|openedAt|v\.literal\("queued"\)|fallbackDeadlineAt/,
);
assert.doesNotMatch(schema, /communityOnboardingConciergeNotes: defineTable/);

for (const file of readdirSync("convex").filter((name) => name.endsWith(".ts"))) {
  if (file === "communityMembershipLifecycle.ts") continue;
  assert.doesNotMatch(read(`convex/${file}`), /insert\("communityMemberships"[\s\S]{0,500}active:\s*true/);
}
assert.match(lifecycle, /createCommunityOnboardingSessionForActivation/);
assert.doesNotMatch(lifecycle, /scheduler|communityOnboardingConcierge|fallbackDeadlineAt/);
assert.match(core, /by_membership_activation/);
assert.match(core, /status: "superseded"/);
assert.match(core, /status: "idle"/);
assert.match(core, /buildCommunityOnboardingOrientationFallback/);
assert.doesNotMatch(core, /status: "queued"|fallbackDeadlineAt|scheduler/);
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
assert.match(onboardingConciergeShared, /surface: "member_concierge"/);
assert.match(onboardingConcierge, /runChatgptNativeToolCompletion/);
assert.match(onboardingConcierge, /runOpenAiNativeToolCompletion/);
assert.match(onboardingConcierge, /resolveGateDecisionForAuthenticatedActor/);
assert.match(onboardingConcierge, /requestedFundingSource: "platform"/);
assert.match(onboardingConcierge, /tools: \[\]/);
assert.match(onboardingConcierge, /toolChoice: "none"/);
assert.match(onboardingConcierge, /requireCommunityChatAccess/);
assert.match(onboardingConcierge, /requireCommunityManager/);
assert.match(onboardingConcierge, /requestMyOrientationNarration/);
assert.match(onboardingConcierge, /claimMyOrientationNarrationInternal/);
assert.match(onboardingConcierge, /session\.status !== "active"/);
assert.match(onboardingConcierge, /session\.orientationCompletedAt/);
assert.match(onboardingConcierge, /stale_generation/);
assert.match(onboardingConcierge, /status: "fallback"/);
assert.doesNotMatch(onboardingConcierge, /"queued"|fallbackDeadlineAt/);
assert.match(onboardingConcierge, /COMMUNITY_ONBOARDING_ORIENTATION_PROVIDER_TIMEOUT_MS/);
assert.match(onboardingConciergeShared, /The application owns every action, button, permission, route, and state transition/);
assert.doesNotMatch(onboardingConcierge, /executeRetrievalHarnessTool|communityAgentServeRequests/);
assert.match(runtime, /recordCommunityOnboardingAgentDockTurnBestEffort/);
assert.doesNotMatch(runtimeResolution, /communityOnboarding|member_agent_mode/);
assert.doesNotMatch(runtimePrompt, /MEMBER_ONBOARDING_GUIDANCE|community_onboarding_guidance/);
assert.doesNotMatch(runtimeManifest, /community_onboarding_guidance/);

assert.match(workflowUi, /Founder orientation video/);
assert.match(workflowUi, /exact fallback if inference is unavailable/);
assert.doesNotMatch(workflowUi, /agent instructions|Concierge guidance/i);
assert.match(controller, /subscribeCloudCommunityOnboardingSession/);
assert.match(controller, /requestCloudCommunityOnboardingOrientation/);
assert.match(controller, /ORIENTATION_REQUEST_RETRY_MS/);
assert.match(controller, /orientationRequestFailedSessionId/);
assert.doesNotMatch(controller, /sendCloudCommunityAgentDockMessage|subscribeCloudCommunityAgentDockTranscript|openCloudCommunityOnboardingSession/);
assert.match(orientation, /buildCommunityOnboardingOrientationFallback/);
assert.match(orientation, /orientation_narration\?\.text/);
assert.match(orientation, /communityOneLiner/);
assert.match(onboardingConciergeShared, /The founder recorded a short welcome/);
assert.match(orientation, /WebCommunityOnboardingConciergeSurface/);
assert.match(orientation, /allowActionsWhilePreparing=\{true\}/);
assert.doesNotMatch(orientation, /textarea|onSubmit/);
assert.match(firstPost, /Your introduction is live/);
assert.doesNotMatch(firstPost, /That’s a strong introduction|Preview sends are simulated/);
assert.match(agentGuide, /WebCommunityOnboardingConciergeSurface/);
assert.match(agentGuide, /Step 3 of 4/);
assert.match(agentGuide, /Your agent has answered/);
assert.match(agentGuide, /communityAvatarUrl/);
assert.match(conciergeSurface, /Community concierge/);
assert.match(conciergeSurface, /useDeterministicConciergeTranscript/);
assert.match(conciergeSurface, /prefers-reduced-motion: reduce/);
assert.match(conciergeSurface, /aria-live="polite"/);
assert.match(conciergeSurface, /renderMarkdown\(displayText\)/);
assert.match(conciergeSurface, /allowActionsWhilePreparing/);
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
assert.match(mcpGuide, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(mcpGuide, /WebCommunityOnboardingConciergeSurface/);
assert.match(mcpGuide, /Copy MCP setup/);
assert.match(mcpGuide, /Go to your harness and paste the setup into the chat/);
assert.doesNotMatch(mcpGuide, /POLYNET_MCP_ENDPOINT_URL/);
assert.match(mcpGuide, /props\.onComplete/);
assert.match(integrations, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(mcpSetup, /https:\/\/www\.polynet\.ai\/runtime\/mcp/);
assert.doesNotMatch(mcpGuide, /access token|bearer token/i);
assert.match(onboardingGateway, /communityOnboardingConcierge:requestMyOrientationNarration/);
assert.doesNotMatch(onboardingShared, /prompt_version|resolved_model_id|failure_code|requested_at/);

console.log("PASS: community onboarding keeps deterministic authority while one bounded, member-funded concierge narration fails closed to stored fallback.");
