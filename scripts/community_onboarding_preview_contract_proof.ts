import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  advanceCommunityOnboardingPreviewSession,
  createCommunityOnboardingPreviewSession,
  shouldPresentCommunityOnboardingAgentStep,
  shouldPresentCommunityOnboardingFirstPost,
  shouldPresentCommunityOnboardingOrientation,
} from "../shared/communityOnboarding.ts";
import {
  buildCommunityOnboardingPreviewPath,
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
} from "../shared/webAppRouteState.ts";

const read = (path: string) => readFileSync(path, "utf8");
const app = read("apps/web/src/App.tsx");
const controller = read("apps/web/src/components/WebCommunityOnboardingController.tsx");
const workflow = read("apps/web/src/components/WebCommunityOnboardingWorkflowSection.tsx");
const previewBar = read("apps/web/src/components/WebCommunityOnboardingPreviewBar.tsx");
const chat = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const orientation = read("apps/web/src/components/WebCommunityOnboardingOrientationModal.tsx");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const convexOnboarding = read("convex/communityOnboarding.ts");
const schema = read("convex/schema.ts");

const originalWindow = globalThis.window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      pathname: "/c/onboarding-qa/onboarding/preview",
      search: "",
    },
  },
});

assert.equal(
  buildCommunityOnboardingPreviewPath("onboarding-qa"),
  "/c/onboarding-qa/onboarding/preview",
);
assert.deepEqual(readPublicRouteFromLocation(), { kind: "app" });
assert.equal(readAppRouteFromLocation().page, "community");
assert.equal(readAppRouteFromLocation().communitySlug, "onboarding-qa");
assert.equal(readAppRouteFromLocation().communityTab, "chat");
assert.equal(readAppRouteFromLocation().communityExperienceMode, "onboarding_preview");

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: originalWindow,
});

const started = createCommunityOnboardingPreviewSession({
  communityId: "community-1",
  config: {
    enabled: false,
    welcome_message: "Welcome to the room.",
    agent_instructions: "Suggest one next move.",
    intro_video_url: "https://example.com/welcome",
    version: 3,
    updated_at: null,
  },
  nowIso: "2026-07-14T12:00:00.000Z",
  previewId: "entry-1",
});
assert.equal(started.phase, "orientation");
assert.equal(started.id, "preview:community-1:3:entry-1");
assert.equal(started.intro_video_url, "https://example.com/welcome");
assert.equal(shouldPresentCommunityOnboardingOrientation(started), true);
assert.equal(shouldPresentCommunityOnboardingFirstPost(started), false);
assert.equal(shouldPresentCommunityOnboardingAgentStep(started), false);
const firstPost = advanceCommunityOnboardingPreviewSession(started, "2026-07-14T12:01:00.000Z");
assert.equal(firstPost.phase, "first_community_post");
assert.equal(shouldPresentCommunityOnboardingOrientation(firstPost), false);
assert.equal(shouldPresentCommunityOnboardingFirstPost(firstPost), true);
assert.equal(shouldPresentCommunityOnboardingAgentStep(firstPost), false);
const agent = advanceCommunityOnboardingPreviewSession(firstPost, "2026-07-14T12:02:00.000Z");
assert.equal(agent.phase, "first_agent_dock_turn");
assert.equal(shouldPresentCommunityOnboardingOrientation(agent), false);
assert.equal(shouldPresentCommunityOnboardingFirstPost(agent), false);
assert.equal(shouldPresentCommunityOnboardingAgentStep(agent), true);
const complete = advanceCommunityOnboardingPreviewSession(agent, "2026-07-14T12:03:00.000Z");
assert.equal(complete.phase, "complete");
assert.equal(complete.status, "completed");
assert.equal(shouldPresentCommunityOnboardingOrientation(complete), false);
assert.equal(shouldPresentCommunityOnboardingFirstPost(complete), false);
assert.equal(shouldPresentCommunityOnboardingAgentStep(complete), false);

assert.match(workflow, /isDirty \? \([\s\S]*Cancel[\s\S]*\) : \([\s\S]*onClick=\{props\.onPreview\}[\s\S]*Preview/);
assert.doesNotMatch(workflow, /community-onboarding-preview/);
assert.match(app, /buildCommunityOnboardingPreviewPath/);
assert.match(app, /onExitPreview=\{handleExitCommunityOnboardingPreview\}/);
assert.match(app, /buildCommunityTabPath\(slug, "settings", null, "workflows"\)/);
assert.match(routeLifecycle, /communityExperienceMode/);

assert.match(controller, /if \(isPreviewMode \|\| !props\.isEnabled/);
assert.match(controller, /fetchCloudCommunityOnboardingConfig/);
assert.doesNotMatch(controller, /fetchCloudCommunityFunnelConfig/);
assert.match(controller, /createCommunityOnboardingPreviewSession/);
assert.match(controller, /advanceCommunityOnboardingPreviewSession/);
assert.match(controller, /mode: isPreviewMode \? "preview" : "live"/);
assert.match(controller, /if \(isPreviewMode\) \{[\s\S]*props\.onExitPreview\?\.\(\);/);
assert.match(controller, /const previewAuthSessionRef = useRef\(props\.session\)/);
assert.match(controller, /const previewEnsureSessionRef = useRef\(props\.ensureSession\)/);
const previewLifecycleEffect = controller.match(
  /useEffect\(\(\) => \{\s*setPreviewSession\(null\);[\s\S]*?\n  \}, \[([\s\S]*?)\n  \]\);/,
);
assert.ok(previewLifecycleEffect, "preview lifecycle effect must remain explicit");
const previewLifecycleDependencies = previewLifecycleEffect[1] ?? "";
assert.match(previewLifecycleDependencies, /canPreview/);
assert.match(previewLifecycleDependencies, /hasPreviewAuthSession/);
assert.match(previewLifecycleDependencies, /isPreviewMode/);
assert.match(previewLifecycleDependencies, /previewCommunityId/);
assert.match(previewLifecycleDependencies, /previewSessionPrincipalId/);
assert.doesNotMatch(previewLifecycleDependencies, /props\.session/);
assert.doesNotMatch(previewLifecycleDependencies, /props\.ensureSession/);
assert.match(previewBar, /Member actions are disabled/);
assert.match(previewBar, /Preview agent step/);
assert.match(previewBar, /Finish preview/);

assert.match(chat, /const canUseComposer = canPresentComposer && !isCommunityOnboardingPreview/);
assert.match(dock, /onboarding\?\.mode === "preview" \|\|\s*!isConversationSurfaceActive/);
assert.match(dock, /const visibleMessages = isOnboardingPreview[\s\S]*\? \[\]/);
assert.match(dock, /const startNewChat = async \(\) => \{[\s\S]*isOnboardingPreview \|\|/);
assert.match(dock, /const submit = async \(event: FormEvent\) => \{[\s\S]*isOnboardingPreview \|\|/);
assert.match(orientation, /readOnly=\{props\.isPreview\}/);
assert.match(orientation, /disabled=\{props\.isPreview \|\| props\.isPreparing \|\| !props\.input\.trim\(\)\}/);

assert.doesNotMatch(convexOnboarding, /previewCommunityOnboarding|onboardingPreview/);
assert.doesNotMatch(schema, /communityOnboardingPreviews/);

console.log("PASS: onboarding preview is route-backed, manager-read-only, local, and zero-write.");
