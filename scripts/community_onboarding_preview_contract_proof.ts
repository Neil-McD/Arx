import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  advanceCommunityOnboardingPreviewSession,
  createCommunityOnboardingPreviewSession,
  shouldPresentCommunityOnboardingAgentReview,
  shouldPresentCommunityOnboardingAgentStep,
  shouldPresentCommunityOnboardingFirstPost,
  shouldPresentCommunityOnboardingMcpHandoff,
  shouldPresentCommunityOnboardingOrientation,
} from "../shared/communityOnboarding.ts";
import { shouldRecordCommunityOnboardingAgentTurn } from "../shared/runtimeInvocationSurface.ts";
import {
  buildCommunityOnboardingPreviewPath,
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
} from "../shared/webAppRouteState.ts";

const read = (path: string) => readFileSync(path, "utf8");
const app = read("apps/web/src/App.tsx");
const controller = read("apps/web/src/components/WebCommunityOnboardingController.tsx");
const concierge = read("convex/communityOnboardingConcierge.ts");
const gateway = read("shared/cloudCommunityOnboardingGateway.ts");
const workflow = read("apps/web/src/components/WebCommunityOnboardingWorkflowSection.tsx");
const previewBar = read("apps/web/src/components/WebCommunityOnboardingPreviewBar.tsx");
const chat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const dockCss = read("apps/web/src/components/WebMemberAgentDock.css");
const orientation = read("apps/web/src/components/WebCommunityOnboardingOrientationSurface.tsx");
const agentGuide = read("apps/web/src/components/WebCommunityOnboardingAgentGuide.tsx");
const mcpGuide = read("apps/web/src/components/WebCommunityOnboardingMcpGuide.tsx");

const originalWindow = globalThis.window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { pathname: "/c/onboarding-qa/onboarding/preview", search: "" } },
});
assert.equal(buildCommunityOnboardingPreviewPath("onboarding-qa"), "/c/onboarding-qa/onboarding/preview");
assert.deepEqual(readPublicRouteFromLocation(), { kind: "app" });
assert.equal(readAppRouteFromLocation().communityExperienceMode, "onboarding_preview");
Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });

const started = createCommunityOnboardingPreviewSession({
  communityId: "community-1",
  config: {
    enabled: false,
    welcome_message: "Welcome to the room.",
    intro_video_url: "https://example.com/welcome",
    updated_at: null,
  },
  nowIso: "2026-07-14T12:00:00.000Z",
  previewId: "entry-1",
});
assert.equal(started.id, "preview:community-1:entry-1");
assert.equal(shouldPresentCommunityOnboardingOrientation(started), true);
const firstPost = advanceCommunityOnboardingPreviewSession(started, "2026-07-14T12:01:00.000Z");
assert.equal(shouldPresentCommunityOnboardingFirstPost(firstPost), true);
const agent = advanceCommunityOnboardingPreviewSession(firstPost, "2026-07-14T12:02:00.000Z");
assert.equal(shouldPresentCommunityOnboardingAgentStep(agent), true);
const agentReview = advanceCommunityOnboardingPreviewSession(agent, "2026-07-14T12:03:00.000Z");
assert.equal(shouldPresentCommunityOnboardingAgentReview(agentReview), true);
assert.equal(shouldPresentCommunityOnboardingMcpHandoff(agentReview), false);
const mcp = advanceCommunityOnboardingPreviewSession(agentReview, "2026-07-14T12:04:00.000Z");
assert.equal(shouldPresentCommunityOnboardingMcpHandoff(mcp), true);
const complete = advanceCommunityOnboardingPreviewSession(mcp, "2026-07-14T12:05:00.000Z");
assert.equal(complete.status, "completed");

assert.equal(shouldRecordCommunityOnboardingAgentTurn({ invocationSurface: "member_agent_dock", surfaceKind: "community", hasCommunityId: true }), true);
assert.equal(shouldRecordCommunityOnboardingAgentTurn({ invocationSurface: "workspace", surfaceKind: "community", hasCommunityId: true }), false);

assert.match(workflow, /Preview full flow/);
assert.match(workflow, /WebCommunityOnboardingOrientationSurface/);
assert.match(app, /buildCommunityOnboardingPreviewPath/);
assert.match(controller, /createCommunityOnboardingPreviewSession/);
assert.match(controller, /generateCloudCommunityOnboardingOrientationPreview/);
assert.match(controller, /requestCloudCommunityOnboardingOrientation/);
assert.match(controller, /community_onboarding_preview_narration_failed/);
assert.match(controller, /mode: isPreviewMode \? "preview" : "live"/);
assert.match(controller, /handleCompleteAgentTurnPreview/);
assert.match(controller, /handleAcknowledgeAgentTurn/);
assert.match(controller, /handleCompleteMcpHandoff/);
assert.doesNotMatch(controller, /sendCloudCommunityAgentDockMessage|onboardingPreview/);
assert.match(gateway, /communityOnboardingConcierge:generateOrientationNarrationPreview/);
assert.match(gateway, /communityOnboardingConcierge:requestMyOrientationNarration/);
assert.match(concierge, /requireCommunityManager/);
assert.match(concierge, /sponsorUserId: userId/);
assert.match(concierge, /status: "fallback"/);
assert.doesNotMatch(concierge, /insert\("communityOnboardingSessions"/);
assert.match(previewBar, /Community posts are simulated/);
assert.match(previewBar, /Your personal agent uses your account/);
assert.match(previewBar, /Concierge generated with your account/);
assert.match(previewBar, /Concierge fallback shown/);
assert.match(previewBar, /Preview complete/);
assert.doesNotMatch(previewBar, /Finish preview/);
assert.match(chat, /completeFirstPostPreview/);
assert.match(dock, /startNewCloudMemberAgentGlobalEpisode/);
assert.match(dock, /requestedFundingSource: "auto"/);
assert.match(dock, /suppressOnboardingProgress: onboarding\?\.mode === "preview"/);
assert.match(dock, /onboarding\.completeAgentTurnPreview\(\)/);
assert.match(dock, /shouldPresentCommunityOnboardingAgentReview/);
assert.match(dock, /onboardingSeededSessionIdsRef/);
assert.doesNotMatch(dock, /Preview only|isVisualOnboardingPreview|memberAgentMode/);
assert.doesNotMatch(dockCss, /member-agent-dock-header::after|member-agent-dock-transcript::after/);
assert.doesNotMatch(orientation, /connected provider|Concierge history|textarea/);
assert.match(agentGuide, /WebCommunityOnboardingConciergeSurface/);
assert.match(agentGuide, /Step 3 of 4/);
assert.match(mcpGuide, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(mcpGuide, /Step 4 of 4/);
assert.match(mcpGuide, /WebCommunityOnboardingConciergeSurface/);
assert.match(mcpGuide, /Copy MCP setup/);
assert.doesNotMatch(mcpGuide, /POLYNET_MCP_ENDPOINT_URL/);

console.log("PASS: preview simulates public writes, uses the builder's ordinary personal agent, and ends with the canonical MCP handoff.");
