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

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("convex/schema.ts");
const lifecycle = read("convex/communityMembershipLifecycle.ts");
const core = read("convex/communityOnboardingCore.ts");
const onboarding = read("convex/communityOnboarding.ts");
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
const chat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
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
const sessionSchema = tableSource("communityOnboardingSessions", "communityInteractionRoots");
assert.match(configSchema, /enabled: v\.boolean\(\)/);
assert.match(configSchema, /welcomeMessage: v\.string\(\)/);
assert.match(configSchema, /introVideoUrl: v\.optional\(v\.string\(\)\)/);
assert.doesNotMatch(configSchema, /agentInstructions|version:/);
assert.match(sessionSchema, /membershipId: v\.id\("communityMemberships"\)/);
assert.match(sessionSchema, /activationSequence: v\.number\(\)/);
assert.match(sessionSchema, /welcomeMessageSnapshot: v\.string\(\)/);
assert.match(sessionSchema, /agentTurnAcknowledgedAt: v\.optional\(v\.number\(\)\)/);
assert.match(sessionSchema, /mcpHandoffCompletedAt: v\.optional\(v\.number\(\)\)/);
assert.doesNotMatch(sessionSchema, /agentInstructions|configVersion|concierge|Seed|openedAt/);

for (const file of readdirSync("convex").filter((name) => name.endsWith(".ts"))) {
  if (file === "communityMembershipLifecycle.ts") continue;
  assert.doesNotMatch(read(`convex/${file}`), /insert\("communityMemberships"[\s\S]{0,500}active:\s*true/);
}
assert.match(lifecycle, /createCommunityOnboardingSessionForActivation/);
assert.match(core, /by_membership_activation/);
assert.match(core, /status: "superseded"/);
assert.doesNotMatch(core, /agentInstructions|readCanonicalCommunityAgentContext|concierge/);
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
assert.match(runtime, /recordCommunityOnboardingAgentDockTurnBestEffort/);
assert.doesNotMatch(runtimeResolution, /communityOnboarding|member_agent_mode/);
assert.doesNotMatch(runtimePrompt, /MEMBER_ONBOARDING_GUIDANCE|community_onboarding_guidance/);
assert.doesNotMatch(runtimeManifest, /community_onboarding_guidance/);

assert.match(workflowUi, /Founder orientation video/);
assert.match(workflowUi, /Shown exactly as written\. Markdown is supported/);
assert.doesNotMatch(workflowUi, /agent instructions|Concierge guidance/i);
assert.match(controller, /subscribeCloudCommunityOnboardingSession/);
assert.doesNotMatch(controller, /sendCloudCommunityAgentDockMessage|subscribeCloudCommunityAgentDockTranscript|openCloudCommunityOnboardingSession/);
assert.match(orientation, /renderMarkdown\(props\.session\.welcome_message\)/);
assert.doesNotMatch(orientation, /textarea|onSubmit|Concierge/);
assert.match(firstPost, /Community concierge/);
assert.match(firstPost, /useDeterministicConciergeTranscript/);
assert.match(firstPost, /prefers-reduced-motion: reduce/);
assert.match(firstPost, /aria-live="polite"/);
assert.match(firstPost, /Your introduction is live/);
assert.doesNotMatch(firstPost, /That’s a strong introduction|Preview sends are simulated/);
assert.match(chat, /buildCommunityOnboardingIntroductionDraft/);
assert.match(dock, /shouldPresentCommunityOnboardingAgentStep/);
assert.match(dock, /shouldPresentCommunityOnboardingAgentReview/);
assert.match(dock, /requestedFundingSource: "auto"/);
assert.match(mcpGuide, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(mcpGuide, /Copy setup/);
assert.match(mcpGuide, /props\.onComplete/);
assert.match(integrations, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(mcpSetup, /https:\/\/www\.polynet\.ai\/runtime\/mcp/);
assert.doesNotMatch(mcpGuide, /access token|bearer token/i);

console.log("PASS: community onboarding deterministically reaches one canonical MCP handoff with no onboarding inference path.");
