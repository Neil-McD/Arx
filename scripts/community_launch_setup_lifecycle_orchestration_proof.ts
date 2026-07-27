import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCommunityLaunchSetupStatusRequestCurrent,
  resolveCommunityLaunchSetupLifecycleStep,
} from "../apps/web/src/controllers/useWebCommunityLaunchSetupLifecycleController.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const appShell = read("apps/web/src/App.tsx");
const controller = read(
  "apps/web/src/controllers/useWebCommunityLaunchSetupLifecycleController.ts",
);
const lifecycleModel = read(
  "apps/web/src/components/webCommunityLaunchSetupLifecycleModel.ts",
);
const setupModal = read(
  "apps/web/src/components/WebCommunityLaunchSetupModal.tsx",
);
const launchGateway = read("shared/cloudCommunityLaunchSetupGateway.ts");
const launchQuery = read("convex/communityLaunchSetup.ts");

const statusWithAboutNext = {
  current_step: "about" as const,
  completed: false,
  completed_items: 2,
  total_items: 12,
  percent: 17,
  missing: [],
  steps: [],
};
assert.equal(
  resolveCommunityLaunchSetupLifecycleStep(null, statusWithAboutNext),
  "about",
  "status-derived continuation must select the canonical current step",
);
assert.equal(
  resolveCommunityLaunchSetupLifecycleStep("knowledge", statusWithAboutNext),
  "knowledge",
  "an explicit durable route step must override the status-derived step",
);
assert.equal(
  resolveCommunityLaunchSetupLifecycleStep("invalid", null),
  "profile",
  "an invalid or absent step must fail closed to profile",
);

const currentRequest = {
  requestId: 4,
  activeRequestId: 4,
  requestSessionKey: "user-a",
  activeSessionKey: "user-a",
  requestCommunityId: "community-a",
  activeCommunityId: "community-a",
};
assert.equal(
  isCommunityLaunchSetupStatusRequestCurrent(currentRequest),
  true,
  "the exact active request may project status",
);
assert.equal(
  isCommunityLaunchSetupStatusRequestCurrent({
    ...currentRequest,
    activeRequestId: 5,
  }),
  false,
  "a superseded request must not project status",
);
assert.equal(
  isCommunityLaunchSetupStatusRequestCurrent({
    ...currentRequest,
    activeSessionKey: "user-b",
  }),
  false,
  "a prior authenticated subject must not project status",
);
assert.equal(
  isCommunityLaunchSetupStatusRequestCurrent({
    ...currentRequest,
    activeCommunityId: "community-b",
  }),
  false,
  "a prior community must not project status after target change",
);
assert.equal(
  isCommunityLaunchSetupStatusRequestCurrent({
    ...currentRequest,
    activeCommunityId: "community-b",
    allowTargetTransition: true,
  }),
  true,
  "the explicit post-create transition may adopt its newly created target",
);

assert.equal(
  (
    appShell.match(
      /useWebCommunityLaunchSetupLifecycleController<AuthSession>\(\{/g,
    ) ?? []
  ).length,
  1,
  "App must instantiate exactly one community-launch lifecycle controller",
);
assert.match(
  appShell,
  /const communityLaunchSetupLifecycleModel =[\s\S]*communityLaunchSetupLifecycle\.model[\s\S]*<WebCommunityLaunchSetupModal[\s\S]*lifecycle=\{communityLaunchSetupLifecycleModel\}/,
  "App must pass one typed lifecycle projection into the launch modal",
);
assert.match(
  setupModal,
  /lifecycle: WebCommunityLaunchSetupLifecycleModel[\s\S]*const \{[\s\S]*isOpen,[\s\S]*mode,[\s\S]*initialStep,[\s\S]*knowledgeIntegrationReloadKey,[\s\S]*knowledgeAutoOpenProvider,[\s\S]*status,[\s\S]*\} = lifecycle/,
  "launch modal must consume lifecycle state through the nested model",
);
assert.match(
  lifecycleModel,
  /isOpen: boolean[\s\S]*mode: "setup" \| "create"[\s\S]*status: CommunityLaunchSetupStatus \| null[\s\S]*initialStep: CommunityLaunchSetupStep \| null[\s\S]*knowledgeIntegrationReloadKey: number[\s\S]*knowledgeAutoOpenProvider: CommunityLaunchKnowledgeProvider \| null/,
  "lifecycle model must expose only the retained presentation state",
);

for (const deletedOwner of [
  "setCommunityLaunchSetupStatus",
  "communityLaunchSetupStatusLoadedCommunityIdRef",
  "setIsLoadingCommunityLaunchSetupStatus",
  "setCommunityLaunchSetupError",
  "setIsCommunityLaunchSetupModalOpen",
  "setIsCommunityLaunchCreateMode",
  "setCommunityLaunchSetupInitialStep",
  "setPendingCommunityLaunchKnowledgeOAuthContext",
  "setPendingCommunityLaunchSetupRouteContext",
]) {
  assert.doesNotMatch(
    appShell,
    new RegExp(deletedOwner),
    `App must not retain duplicate launch lifecycle owner ${deletedOwner}`,
  );
}
assert.doesNotMatch(
  appShell,
  /loadCloudCommunityLaunchSetupStatus/,
  "App must not directly own launch status hydration",
);
assert.match(
  controller,
  /import \{ loadCloudCommunityLaunchSetupStatus \} from "\.\.\/\.\.\/\.\.\/\.\.\/shared\/cloudCommunityLaunchSetupGateway"/,
  "lifecycle controller must be the sole web composition owner of launch status hydration",
);
assert.match(
  launchGateway,
  /community:getCommunityLaunchSetupStatus/,
  "lifecycle status hydration must retain the canonical cloud query",
);
assert.match(
  launchQuery,
  /getCommunityLaunchSetupStatus = query[\s\S]*requireCommunityManager\(\{[\s\S]*communityId: args\.communityId[\s\S]*userId/,
  "server status authority must remain manager-gated",
);

assert.match(
  controller,
  /type CommunityLaunchRestoreIntent =[\s\S]*kind: "route"[\s\S]*kind: "knowledge_oauth"/,
  "direct-route and OAuth restoration must share one discriminated intent owner",
);
assert.equal(
  (controller.match(/useState<CommunityLaunchRestoreIntent \| null>/g) ?? [])
    .length,
  1,
  "controller must retain exactly one pending restoration state",
);
assert.match(
  controller,
  /readCurrentCommunityLaunchSetupRouteContext\(\)[\s\S]*kind: "route"[\s\S]*step: context\.step/,
  "controller must initialize durable direct-route restoration with the exact step",
);
assert.match(
  controller,
  /queueKnowledgeOAuthRestore[\s\S]*if \(!context\.shouldRestore\) return;[\s\S]*kind: "knowledge_oauth"/,
  "controller must translate an authorized OAuth return into the Knowledge restore intent",
);

assert.match(
  controller,
  /statusRequestIdRef[\s\S]*requestSessionKey[\s\S]*isCommunityLaunchSetupStatusRequestCurrent\(\{[\s\S]*activeSessionKey: latestTarget\.sessionKey[\s\S]*activeCommunityId: latestTarget\.activeCommunityId/,
  "status results must be bound to request generation, authenticated subject, and active community",
);
assert.match(
  controller,
  /if \(mode === "create"\) \{[\s\S]*invalidateStatusRequest\(\);[\s\S]*setStatus\(null\)[\s\S]*return;/,
  "create mode must invalidate existing-community status hydration",
);
assert.match(
  controller,
  /const shouldLoad =[\s\S]*Boolean\(params\.session\)[\s\S]*Boolean\(activeCommunityId\)[\s\S]*params\.canManageCommunitySettings[\s\S]*params\.isAccountSetupComplete[\s\S]*params\.activePage === "community"[\s\S]*Boolean\(isOpen \|\| restoreIntent\)/,
  "status hydration must fail closed on session, target, manager access, account setup, page, and lifecycle demand",
);
assert.match(
  controller,
  /hasTarget && !activeMatchesTarget[\s\S]*params\.onRequestCommunityTarget[\s\S]*loadedCommunityId !== activeCommunityId[\s\S]*setInitialStep\([\s\S]*restoreIntent\.kind === "knowledge_oauth"[\s\S]*"knowledge"[\s\S]*restoreIntent\.step[\s\S]*setIsOpen\(true\)/,
  "restore must select the target before opening and require status for that exact active community",
);
assert.match(
  controller,
  /loadAndOpenCommunity[\s\S]*loadStatus\(\{[\s\S]*allowTargetTransition: true[\s\S]*resolveCommunityLaunchSetupLifecycleStep[\s\S]*setInitialStep\(nextStep\)/,
  "post-create continuation must load status through the lifecycle owner and adopt its canonical next step",
);

assert.doesNotMatch(
  controller,
  /window\.history|window\.location|finalizeCloudCommunity|createCloudCommunity|saveCloudCommunity|deleteCloudCommunity|setCloudCommunity/,
  "lifecycle controller must not absorb shell navigation, OAuth finalization, creation, or canonical writes",
);
assert.match(
  appShell,
  /window\.history\.replaceState[\s\S]*finalizeCloudCommunityGitHubSourceOAuth[\s\S]*finalizeCloudCommunityGoogleDriveSourceOAuth/,
  "browser history and OAuth finalization must remain app-shell authorities",
);
assert.match(
  appShell,
  /handleCreateCommunityFromLaunch[\s\S]*createCloudCommunity[\s\S]*communityLaunchSetupLifecycle\.loadAndOpenCommunity/,
  "community creation must remain shell-orchestrated and hand status continuation to the lifecycle owner",
);

console.log(
  "PASS: community launch setup lifecycle has one fail-closed web owner.",
);
