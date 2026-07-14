import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  buildCommunityOnboardingOrientationSeed,
  buildCommunityOnboardingMilestonePatch,
  describeCommunityOnboardingPhaseObjective,
  deriveCommunityOnboardingPhase,
  normalizeCommunityOnboardingVideoUrl,
  shouldPresentCommunityOnboardingAgentStep,
  shouldPresentCommunityOnboardingFirstPost,
  shouldPresentCommunityOnboardingOrientation,
  type CommunityOnboardingMilestone,
  type CommunityOnboardingMilestoneRow,
} from "../shared/communityOnboarding.ts";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("convex/schema.ts");
const lifecycle = read("convex/communityMembershipLifecycle.ts");
const onboarding = read("convex/communityOnboarding.ts");
const onboardingCore = read("convex/communityOnboardingCore.ts");
const threads = read("convex/threads.ts");
const conciergeIntake = read("convex/communityAgentConciergeCore.ts");
const conciergeWorker = read("convex/communityAgentServeWorker.ts");
const interactions = read("convex/communityInteractions.ts");
const runtime = read("convex/runtimeTurnHandlers.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const runtimeInvocationSurface = read("shared/runtimeInvocationSurface.ts");
const runtimeManifest = read("shared/runtimeContextManifest.ts");
const codexWorkerBridge = read("convex/polynetCodexWorkerBridge.ts");
const settings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const workflowUi = read("apps/web/src/components/WebCommunityOnboardingWorkflowSection.tsx");
const communityHost = read("apps/web/src/components/WebCommunityHost.tsx");
const onboardingController = read("apps/web/src/components/WebCommunityOnboardingController.tsx");
const orientationModal = read("apps/web/src/components/WebCommunityOnboardingOrientationModal.tsx");
const orientationSurface = read("apps/web/src/components/WebCommunityOnboardingOrientationSurface.tsx");
const firstPostGuide = read("apps/web/src/components/WebCommunityOnboardingFirstPostGuide.tsx");
const agentGuide = read("apps/web/src/components/WebCommunityOnboardingAgentGuide.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const app = read("apps/web/src/App.tsx");
const personalDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const baseCss = read("apps/web/src/base.css");

function advance(
  session: CommunityOnboardingMilestoneRow,
  milestone: CommunityOnboardingMilestone,
  nowMs: number,
): CommunityOnboardingMilestoneRow {
  return { ...session, ...(buildCommunityOnboardingMilestonePatch(session, milestone, nowMs) ?? {}) };
}

assert.equal(
  normalizeCommunityOnboardingVideoUrl("https://example.com/founder-welcome"),
  "https://example.com/founder-welcome",
);
assert.equal(normalizeCommunityOnboardingVideoUrl("javascript:alert(1)"), null);
assert.match(
  buildCommunityOnboardingOrientationSeed({
    communityName: "Practice",
    welcomeMessage: "Welcome to the room.",
  }),
  /Welcome to the room\.[\s\S]*personal agent[\s\S]*Practice/,
);
assert.match(describeCommunityOnboardingPhaseObjective("orientation"), /orientation questions/);

// Behavioral state-machine proof: milestones are idempotent, phase is derived,
// and completion occurs only after all three member outcomes exist.
let session: CommunityOnboardingMilestoneRow = { status: "active" };
assert.equal(deriveCommunityOnboardingPhase(session), "orientation");
assert.equal(shouldPresentCommunityOnboardingOrientation({ status: "active", phase: "orientation" }), true);
assert.equal(shouldPresentCommunityOnboardingOrientation({ status: "active", phase: "first_community_post" }), false);
assert.equal(shouldPresentCommunityOnboardingOrientation({ status: "dismissed", phase: "orientation" }), false);
assert.equal(shouldPresentCommunityOnboardingFirstPost({ status: "active", phase: "first_community_post" }), true);
assert.equal(shouldPresentCommunityOnboardingFirstPost({ status: "active", phase: "first_agent_dock_turn" }), false);
assert.equal(shouldPresentCommunityOnboardingFirstPost({ status: "completed", phase: "first_community_post" }), false);
assert.equal(shouldPresentCommunityOnboardingAgentStep({ status: "active", phase: "first_agent_dock_turn" }), true);
assert.equal(shouldPresentCommunityOnboardingAgentStep({ status: "active", phase: "first_community_post" }), false);
assert.equal(shouldPresentCommunityOnboardingAgentStep({ status: "dismissed", phase: "first_agent_dock_turn" }), false);
session = advance(session, "opened", 10);
assert.equal(session.openedAt, 10);
session = advance(session, "opened", 20);
assert.equal(session.openedAt, 10, "opening twice must not rewrite the first timestamp");
session = advance(session, "orientation_completed", 30);
assert.equal(session.orientationCompletedAt, 30);
assert.equal(deriveCommunityOnboardingPhase(session), "first_community_post");
session = advance(session, "first_community_post", 40);
assert.equal(session.firstCommunityPostAt, 40);
assert.equal(deriveCommunityOnboardingPhase(session), "first_agent_dock_turn");
session = advance(session, "first_agent_dock_turn", 50);
assert.equal(session.firstAgentDockTurnAt, 50);
assert.equal(session.status, "completed");
assert.equal(session.completedAt, 50);
assert.equal(deriveCommunityOnboardingPhase(session), "complete");
assert.equal(
  buildCommunityOnboardingMilestonePatch(session, "first_community_post", 60),
  null,
  "terminal sessions must reject later milestone writes",
);

assert.match(schema, /communityMemberships: defineTable\([\s\S]*activationSequence:[\s\S]*activatedAt:/);
assert.match(schema, /communityOnboardingConfigs: defineTable/);
assert.match(schema, /communityOnboardingSessions: defineTable/);
assert.match(schema, /introVideoUrl: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /orientationSeedMessageKey: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /v\.literal\("active"\)[\s\S]*v\.literal\("completed"\)[\s\S]*v\.literal\("dismissed"\)[\s\S]*v\.literal\("superseded"\)/);
assert.doesNotMatch(schema, /communityOnboardingSessions:[\s\S]{0,1800}v\.literal\("queued"\)/);
assert.match(schema, /\.index\("by_membership_activation", \["membershipId", "activationSequence"\]\)/);
assert.match(schema, /by_user_community_status_createdAt/);

for (const file of readdirSync("convex").filter((name) => name.endsWith(".ts"))) {
  const source = read(`convex/${file}`);
  if (file === "communityMembershipLifecycle.ts") continue;
  assert.doesNotMatch(
    source,
    /insert\("communityMemberships"[\s\S]{0,500}active:\s*true/,
    `direct active membership insertion must route through lifecycle helper: ${file}`,
  );
}

assert.match(lifecycle, /createCommunityOnboardingSessionForActivation/);
assert.match(lifecycle, /activationSequence[\s\S]*\+ 1/);
assert.match(onboardingCore, /if \(!config\?\.enabled\) return null/);
assert.match(onboardingCore, /by_membership_activation/);
assert.match(onboardingCore, /status: "superseded"/);
assert.match(onboardingCore, /config\.introVideoUrl/);
assert.doesNotMatch(onboardingCore, /communityFunnels|heroMediaKind/);
assert.doesNotMatch(onboardingCore, /scheduler|deliverCommunityOnboardingWelcome/);
assert.doesNotMatch(onboardingCore, /\.collect\(\)/, "onboarding reads must remain bounded");

assert.match(onboarding, /completeMyCommunityOnboardingOrientation/);
assert.match(onboarding, /recordPersonalAgentDockTurnInternal/);
assert.match(onboarding, /resolveActivePersonalAgentGuidanceInternal/);
assert.match(onboarding, /resolveManagerPersonalAgentTestGuidanceInternal/);
assert.match(onboarding, /resolveManagerPersonalAgentTestGuidanceInternal[\s\S]*requireCommunityManager/);
assert.match(onboarding, /deriveCommunityOnboardingPhase\(/);
assert.match(onboarding, /deriveCommunityOnboardingPhase\(activeSession\) !== "first_agent_dock_turn"/);
assert.match(onboarding, /community-onboarding:\$\{normalizeIdValue\(session\._id\)\}:orientation/);
assert.match(onboarding, /by_owner_messageKey/);
assert.match(onboarding, /orientationSeedMessageSeq/);
assert.match(onboarding, /buildCommunityOnboardingOrientationSeed/);
assert.match(onboarding, /status: "dismissed"/);
assert.doesNotMatch(onboarding, /communityAgent|Concierge|runChatgpt|provider/i);
assert.match(interactions, /milestone: "first_community_post"/);
assert.match(runtime, /shouldRecordCommunityOnboardingAgentTurn/);
assert.match(runtime, /recordPersonalAgentDockTurnInternal/);
assert.match(runtimeInvocationSurface, /params\.memberAgentMode === "standard"/);
assert.match(runtimeInvocationSurface, /params\.surfaceKind === "community"/);
assert.match(runtimeResolution, /resolveActivePersonalAgentGuidanceInternal/);
assert.match(runtimeResolution, /resolveManagerPersonalAgentTestGuidanceInternal/);
assert.match(runtimeResolution, /community_onboarding_test_forbidden/);
assert.match(runtimeResolution, /memberAgentSurfaceContext\?\.kind === "community"/);
assert.match(runtimeResolution, /runtimeCommunityOnboardingInstructions/);
assert.doesNotMatch(
  runtimeResolution.slice(runtimeResolution.indexOf("export type RuntimeTurnInput"), runtimeResolution.indexOf("export type PublicTurnInput")),
  /onboarding/i,
  "the browser turn payload must not supply onboarding system guidance",
);
assert.match(runtimePrompt, /MEMBER_ONBOARDING_GUIDANCE/);
assert.match(runtimePrompt, /grants no tools, data, permissions, or authority/);
assert.match(runtimePrompt, /id: "community_onboarding_guidance"/);
assert.match(runtimeManifest, /id: "community_onboarding_guidance"/);
assert.match(threads, /ensureGlobalMemberAgentChannelWithCommunityLensCore/);
assert.match(runtimeAgentLoop, /communityOnboardingInstructions: params\.communityOnboardingInstructions/);
assert.match(codexWorkerBridge, /communityOnboardingInstructions: params\.communityOnboardingInstructions/);

assert.doesNotMatch(conciergeIntake, /communityOnboarding|onboardingSession|requestMode/);
assert.doesNotMatch(conciergeWorker, /communityOnboarding|onboardingSession|community_concierge/);
assert.equal(
  existsSync("apps/web/src/components/WebCommunityOnboardingCard.tsx"),
  false,
  "the discarded custom Concierge transcript must remain deleted",
);
assert.equal(existsSync("convex/communityAgentDockCore.ts"), false);
assert.match(personalDock, /shouldPresentCommunityOnboardingAgentStep/);
assert.match(personalDock, /WebCommunityOnboardingAgentGuide/);
assert.match(personalDock, /WebCommunityOnboardingOrientationModal/);
assert.match(personalDock, /Test your onboarding agent/);
assert.match(personalDock, /memberAgentMode: isBuilderAgentTest/);
assert.match(personalDock, /requestedFundingSource: "auto"/);
assert.match(personalDock, /orientationSeedSeq/);
assert.match(personalDock, /onboardingOpenedSessionIdsRef/);
assert.match(personalDock, /textareaRef/);
assert.match(personalDock, /aria-describedby/);

assert.match(settings, /"community", "workflows", "integrations"/);
assert.match(workflowUi, /Existing members are not backfilled/);
assert.match(workflowUi, /Personal agent guidance/);
assert.match(workflowUi, /Founder orientation video/);
assert.match(workflowUi, /separate from the public funnel/);
assert.match(workflowUi, /className="settings-section community-onboarding-workflow"/);
assert.match(workflowUi, /className="create-community-field community-onboarding-field/);
assert.match(workflowUi, /Member view/);
assert.match(workflowUi, /Live draft · no inference/);
assert.match(workflowUi, /WebCommunityOnboardingOrientationSurface/);
assert.match(workflowUi, /Advanced agent instructions/);
assert.doesNotMatch(workflowUi, /className="create-field"/);
assert.match(workflowUi, /role="switch"/);
assert.match(workflowUi, /className="community-onboarding-switch"/);
assert.match(baseCss, /\.community-onboarding-field textarea \{[\s\S]*?width: 100%;[\s\S]*?font-family: inherit;/);
assert.match(baseCss, /input:checked ~ \.community-onboarding-switch/);
assert.doesNotMatch(communityHost, /WebCommunityOnboardingController/);
assert.match(communityHost, /firstPostFocusRequest/);
assert.match(communityHost, /onSelectCommunityTab\?\.\("chat"\)/);
assert.match(communityHost, /chatInputRef\.current/);
assert.match(onboardingController, /subscribeCloudCommunityOnboardingSession/);
assert.equal(
  onboardingController.match(/subscribeCloudCommunityOnboardingSession\(/g)?.length,
  1,
  "orientation and first-post guidance must share one live onboarding subscription",
);
assert.match(onboardingController, /WebCommunityOnboardingContext\.Provider/);
assert.match(onboardingController, /openCloudCommunityOnboardingSession/);
assert.match(onboardingController, /completeCloudCommunityOnboardingOrientation/);
assert.match(onboardingController, /dismissCloudCommunityOnboardingSession/);
assert.doesNotMatch(onboardingController, /WebCommunityOnboardingOrientationModal/);
assert.match(orientationModal, /role="dialog"/);
assert.match(orientationModal, /aria-modal="true"/);
assert.match(orientationModal, /WebCommunityOnboardingOrientationSurface/);
assert.match(orientationSurface, /renderHeroMediaDefault\("video"/);
assert.match(orientationSurface, /Your personal agent/);
assert.match(orientationSurface, /onSubmit=\{props\.onSubmit\}/);
assert.match(orientationSurface, /Skip onboarding/);
assert.match(orientationSurface, /Continue to community chat/);
assert.match(firstPostGuide, /Introduce yourself to \{props\.communityName\}/);
assert.match(firstPostGuide, /what you’re working on, why you joined/);
assert.match(firstPostGuide, /Skip onboarding/);
assert.doesNotMatch(firstPostGuide, /onCommunityMessageInputChange|onSendCommunityMessage|runChatgpt|provider/i);
assert.match(chatPanel, /shouldPresentCommunityOnboardingFirstPost/);
assert.match(chatPanel, /WebCommunityOnboardingFirstPostGuide/);
assert.match(chatPanel, /is-onboarding-first-post/);
assert.match(chatPanel, /aria-describedby/);
assert.match(app, /onSelectCommunityTab: handleSelectCommunityTab/);
assert.match(app, /<WebCommunityOnboardingController/);
assert.match(app, /onOrientationCompleted=\{handleCommunityOnboardingOrientationCompleted\}/);
assert.match(app, /onRequestOpen=\{\(\) => setMobileOverlay\("agent"\)\}/);
assert.match(agentGuide, /Ask your agent for your next move/);
assert.match(agentGuide, /It already has \{props\.communityName\} context/);
assert.match(agentGuide, /Skip onboarding/);
assert.doesNotMatch(agentGuide, /setInput|startNewCloudMemberAgentGlobalEpisode|runAgentTurn/);

console.log("PASS: onboarding is activation-bound, milestone-driven, and personal-agent scoped.");
