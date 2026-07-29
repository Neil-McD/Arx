import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const app = read("apps/web/src/App.tsx");
const compositionRoot = read(
  "apps/web/src/components/WebAppCompositionRoot.tsx",
);
const entryStyles = read("apps/web/src/index.css");
const globalStyles = read("apps/web/src/base.css");

assert.match(
  packageJson,
  /"check:app-shell-decomposition-contract": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/app_shell_decomposition_contract_proof\.ts"/,
  "package scripts must expose the App shell decomposition contract",
);

assert.ok(
  app.split("\n").length <= 3_200,
  "App.tsx must remain within its post-decomposition structural budget",
);
assert.doesNotMatch(
  app,
  /\buse(?:State|Effect|LayoutEffect|Callback|Reducer|SyncExternalStore)\b/,
  "App.tsx must not own feature state, effects, subscriptions, or callbacks",
);
assert.doesNotMatch(
  app,
  /\b(?:async|await)\b/,
  "App.tsx must not own asynchronous product workflows",
);
assert.doesNotMatch(
  app,
  /\b(?:fetch|client\.(?:query|mutation|action))\s*\(/,
  "App.tsx must not call transports directly",
);
assert.match(
  app,
  /import \{ WebAppCompositionRoot \} from "\.\/components\/WebAppCompositionRoot";[\s\S]*return \(\s*<WebAppCompositionRoot/,
  "App.tsx must terminate in the canonical application composition root",
);
for (const directPresentationOwner of [
  "WebShellChromeHost",
  "WebGlobalOverlayHost",
  "WebDirectMessagesHost",
  "WebCommunityOnboardingController",
] as const) {
  assert.doesNotMatch(
    app,
    new RegExp(
      `from "\\.\\/components\\/${directPresentationOwner}"`,
    ),
    `App.tsx must not bypass WebAppCompositionRoot to mount ${directPresentationOwner}`,
  );
  assert.match(
    compositionRoot,
    new RegExp(`\\b${directPresentationOwner}\\b`),
    `WebAppCompositionRoot must own ${directPresentationOwner}`,
  );
}
assert.match(
  compositionRoot,
  /const WebAppMainSurfaceHost = lazy[\s\S]*const WebMemberAgentDock = lazy/,
  "the composition root must preserve lazy main-surface and member-agent boundaries",
);
assert.match(
  compositionRoot,
  /mainSurface=\{mainSurface\}[\s\S]*globalOverlays=\{globalOverlays\}/,
  "the composition root must inject the main surface and global portals into shell chrome",
);

const boundedFeatureOwners = [
  "apps/web/src/components/WebAppCompositionRoot.tsx",
  "apps/web/src/controllers/useWebAccountPlanController.ts",
  "apps/web/src/controllers/useWebAuthErrorToastLifecycle.ts",
  "apps/web/src/controllers/useWebBuilderPartnerProgramController.ts",
  "apps/web/src/controllers/useWebCommunityDirectoryState.ts",
  "apps/web/src/controllers/useWebCommunityFunnelAboutController.ts",
  "apps/web/src/controllers/useWebCommunityNavigationActions.ts",
  "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts",
  "apps/web/src/controllers/useWebCommunityTabAccessGuard.ts",
  "apps/web/src/controllers/useWebCommunityVoiceController.ts",
  "apps/web/src/controllers/useWebDirectMessageDeepLinkLifecycle.ts",
  "apps/web/src/controllers/useWebDirectMessagesChromeController.tsx",
  "apps/web/src/controllers/useWebDiscoverActivationController.ts",
  "apps/web/src/controllers/useWebJoinedCommunityEntryAction.ts",
  "apps/web/src/controllers/useWebMemberAgentSurfaceController.ts",
  "apps/web/src/controllers/useWebMissingCommunityRouteGuard.ts",
  "apps/web/src/controllers/useWebMobileChromeReadingModeLifecycle.ts",
  "apps/web/src/controllers/useWebPendingAuthIntentController.ts",
  "apps/web/src/controllers/useWebPersonalMemoryImportAction.ts",
  "apps/web/src/controllers/useWebProviderConnectionsController.ts",
  "apps/web/src/controllers/useWebPublicFunnelEntryController.ts",
  "apps/web/src/controllers/useWebShellActionController.ts",
  "apps/web/src/controllers/useWebTelemetryLifecycle.ts",
] as const;
for (const ownerPath of boundedFeatureOwners) {
  assert.equal(existsSync(ownerPath), true, `${ownerPath} must exist`);
  assert.ok(
    read(ownerPath).split("\n").length <= 300,
    `${ownerPath} must remain a bounded owner rather than become a replacement monolith`,
  );
}

for (const [ownerPath, requiredMarkers] of [
  [
    "apps/web/src/controllers/useWebShellState.ts",
    ["useState", "activePage", "communityTab"],
  ],
  [
    "apps/web/src/controllers/useWebShellNavigationController.ts",
    ["useWebPathRouteLifecycle", "navigateTo", "pushNavSnapshot"],
  ],
  [
    "apps/web/src/controllers/useWebProviderConnectionsController.ts",
    ["useState", "useEffect", "loadCloudProviderConnections"],
  ],
  [
    "apps/web/src/controllers/useWebAccountPlanController.ts",
    ["startCloudPremiumSubscriptionCheckout", "setDevAccountTierCanonical"],
  ],
  [
    "apps/web/src/controllers/useWebBuilderPartnerProgramController.ts",
    ["captureBuilderPartnerAttributionFromCurrentUrl", "settingsGroup"],
  ],
  [
    "apps/web/src/controllers/useWebCommunityVoiceController.ts",
    ["useWebVoiceInputController", "appendMemberAgentTranscript"],
  ],
  [
    "apps/web/src/controllers/useWebTelemetryLifecycle.ts",
    ["updateSentryUiContext", "updatePosthogUiContext"],
  ],
] as const) {
  const owner = read(ownerPath);
  for (const marker of requiredMarkers) {
    assert.ok(
      owner.includes(marker),
      `${ownerPath} must own ${marker}`,
    );
  }
}

assert.ok(
  globalStyles.split("\n").length < 500,
  "base.css must remain a bounded global tokens/reset stylesheet",
);
assert.doesNotMatch(
  globalStyles,
  /\.app-root|\.app-shell|\.community-|\.settings-|\.modal/,
  "feature and shell presentation must not return to global base.css",
);
assert.match(
  entryStyles,
  /@import "\.\/base\.css";[\s\S]*@import "\.\/styles\/shell-and-onboarding\.css";[\s\S]*@import "\.\/styles\/community-and-content\.css";[\s\S]*@import "\.\/styles\/settings-runtime-and-theme-overrides\.css";/,
  "the web entry must preserve the explicit feature stylesheet cascade",
);

console.log("app_shell_decomposition_contract_proof: ok");
