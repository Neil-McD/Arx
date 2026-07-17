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
const gateway = read("shared/cloudCommunityOnboardingGateway.ts");
const workflow = read("apps/web/src/components/WebCommunityOnboardingWorkflowSection.tsx");
const previewBar = read("apps/web/src/components/WebCommunityOnboardingPreviewBar.tsx");
const chat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const dockCss = read("apps/web/src/components/WebMemberAgentDock.css");
const orientation = read("apps/web/src/components/WebCommunityOnboardingOrientationSurface.tsx");
const agentGuide = read("apps/web/src/components/WebCommunityOnboardingAgentGuide.tsx");
const mcpGuide = read("apps/web/src/components/WebCommunityOnboardingMcpGuide.tsx");
const mcpCompatibility = read("apps/web/src/components/WebCommunityOnboardingMcpCompatibility.tsx");
const conciergeSurface = read("apps/web/src/components/WebCommunityOnboardingConciergeSurface.tsx");

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
assert.doesNotMatch(controller, /generateCloudCommunityOnboardingConciergePreview/);
assert.doesNotMatch(controller, /requestCloudCommunityOnboardingConciergeNarration/);
assert.doesNotMatch(controller, /community_onboarding_concierge_narration_failed/);
assert.doesNotMatch(controller, /communityOnboardingConciergeCueForPhase/);
assert.doesNotMatch(controller, /preparingNarrationCue|concierge_narrations/);
assert.match(controller, /mode: isPreviewMode \? "preview" : "live"/);
assert.match(controller, /handleCompleteAgentTurnPreview/);
assert.match(controller, /handleAcknowledgeAgentTurn/);
assert.match(controller, /handleCompleteMcpHandoff/);
assert.doesNotMatch(controller, /sendCloudCommunityAgentDockMessage|onboardingPreview/);
assert.doesNotMatch(gateway, /communityOnboardingConcierge:/);
assert.equal(readFileSync("shared/communityOnboardingCopy.ts", "utf8").includes("buildCommunityOnboardingCopy"), true);
assert.match(previewBar, /Community posts are simulated/);
assert.match(previewBar, /Your personal agent uses your account/);
assert.doesNotMatch(previewBar, /Concierge generated|Concierge fallback|narration/i);
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
assert.match(orientation, /buildCommunityOnboardingCopy/);
assert.doesNotMatch(orientation, /concierge_narrations|communityOneLiner|isPreparing/);
assert.match(agentGuide, /WebCommunityOnboardingConciergeSurface/);
assert.match(agentGuide, /Step 3 of 4/);
assert.doesNotMatch(agentGuide, /props\.narration|isPreparing/);
assert.match(agentGuide, /personal_agent_intro/);
assert.match(agentGuide, /personal_agent_review/);
assert.match(agentGuide, /showPrimary=\{props\.isComplete\}/);
assert.doesNotMatch(conciergeSurface, /community concierge is thinking|isPreparing|allowActionsWhilePreparing/i);
assert.match(mcpGuide, /POLYNET_MCP_SETUP_BUNDLE/);
assert.match(mcpGuide, /POLYNET_MCP_TOOL_COUNT_LABEL/);
assert.match(mcpGuide, /Step 4 of 4/);
assert.match(mcpGuide, /WebCommunityOnboardingConciergeSurface/);
assert.doesNotMatch(mcpGuide, /props\.narration|isPreparing/);
assert.match(mcpGuide, /community-onboarding-mcp-product-card/);
assert.match(mcpGuide, /Copy MCP setup/);
assert.match(mcpGuide, /WebCommunityOnboardingMcpCompatibility/);
assert.match(workflow, /WebCommunityOnboardingMcpCompatibility/);
assert.match(mcpCompatibility, /Works with/);
assert.match(mcpCompatibility, /Codex/);
assert.match(mcpCompatibility, /Claude Code/);
assert.match(mcpCompatibility, /OpenClaw/);
assert.match(mcpCompatibility, /Hermes/);
assert.match(mcpCompatibility, /other MCP clients/);
assert.doesNotMatch(mcpGuide, /POLYNET_MCP_ENDPOINT_URL/);

console.log("PASS: preview uses deterministic onboarding guidance, simulates public writes, runs the builder's ordinary personal agent, and ends with the canonical MCP handoff.");
