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
const mainSurfaceFallback = read(
  "apps/web/src/components/WebAppMainSurfaceFallback.tsx",
);
const communityInteractionBootstrap = read(
  "apps/web/src/components/WebCommunityInteractionBootstrap.tsx",
);
const shellChromeHost = read(
  "apps/web/src/components/WebShellChromeHost.tsx",
);
const communityRail = read(
  "apps/web/src/components/WebCommunityRail.tsx",
);
const shellChromeHostPropsBuilder = read(
  "apps/web/src/controllers/buildWebShellChromeHostProps.ts",
);
const communityNav = read("shared/CommunityNav.tsx");
const entryStyles = read("apps/web/src/index.css");
const globalStyles = read("apps/web/src/base.css");
const featureStyles = [
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
].join("\n");

assert.match(
  packageJson,
  /"check:app-shell-decomposition-contract": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/app_shell_decomposition_contract_proof\.ts"/,
  "package scripts must expose the App shell decomposition contract",
);

for (const retiredProviderSurface of [
  "apps/web/src/controllers/useWebProviderConnectionsController.ts",
  "apps/web/src/controllers/useWebProviderConnectionUiController.ts",
  "apps/web/src/components/WebProviderConnectionModalHost.tsx",
  "apps/web/src/components/WebChatgptConnectModal.tsx",
  "shared/cloudProviderConnectionsGateway.ts",
] as const) {
  assert.equal(
    existsSync(retiredProviderSurface),
    false,
    `${retiredProviderSurface} must stay deleted from the current web product`,
  );
}
assert.doesNotMatch(
  app,
  /useWebProviderConnectionsController|providerConnectionUi|connectChatgpt/,
  "the app shell must not restore personal ChatGPT connection orchestration",
);

assert.ok(
  app.split("\n").length <= 3_250,
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
assert.doesNotMatch(
  app,
  /readOAuthCallbackShellVariantFromLocation|read(?:App|Public)RouteFromLocation|readShellVariantFromPathname/,
  "App.tsx must not bypass the shell-state owner for initial route hydration",
);
assert.doesNotMatch(
  app,
  /lastAutoRedeemPendingPurchasesUserIdRef|autoRedeemPendingPurchases(?:Attempt|Timeout)Ref/,
  "App.tsx must not own billing retry state",
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
  /const WebAppMainSurfaceHost = lazy/,
  "the primary main surface must retain its bounded route-level split",
);
assert.match(
  compositionRoot,
  /fallback=\{<WebAppMainSurfaceFallback \{\.\.\.props\.mainSurfaceHostProps\} \/>\}/,
  "the primary lazy boundary must reserve a canonical main-surface shape",
);
assert.match(
  mainSurfaceFallback,
  /community-body[\s\S]*community-chat community-member-chat[\s\S]*workspace-body chat-feed[\s\S]*community-interaction-scroll[\s\S]*WebCommunityInteractionBootstrap/,
  "the route fallback must reserve the complete community shell geometry",
);
assert.match(
  communityInteractionBootstrap,
  /community-interaction-projection has-context-panel community-interaction-bootstrap[\s\S]*community-interaction-main-composer[\s\S]*community-context-panel/,
  "one shared bootstrap must own center, composer, and context-panel geometry",
);
assert.match(
  compositionRoot,
  /const WebMemberAgentDock = lazy/,
  "the secondary member-agent dock may retain its lazy boundary",
);
assert.match(
  compositionRoot,
  /mainSurface=\{mainSurface\}[\s\S]*globalOverlays=\{globalOverlays\}/,
  "the composition root must inject the main surface and global portals into shell chrome",
);
assert.doesNotMatch(
  shellChromeHost,
  /^\s*showDesktopCommunity(?:Rail|Nav): boolean;/m,
  "shell visibility must not have duplicate top-level ownership",
);
assert.match(
  shellChromeHost,
  /showDesktopCommunityRail: props\.communityShell\.showDesktopCommunityRail,[\s\S]*showDesktopCommunityNav: props\.communityShell\.showDesktopCommunityNav/,
  "shell rendering and grid classes must read one canonical visibility projection",
);
assert.doesNotMatch(
  shellChromeHostPropsBuilder,
  /\n\s{4}showDesktopCommunity(?:Rail|Nav): params\.showDesktopCommunity(?:Rail|Nav),\n\s{4}isGlobalSettings:/,
  "the shell props builder must not duplicate nested visibility state at the host boundary",
);
assert.match(
  entryStyles,
  /--product-shell-gap:\s*8px;[\s\S]*--community-shell-inset:\s*var\(--product-shell-gap\);/,
  "desktop product shells should share one canonical structural gap token",
);
assert.match(
  entryStyles,
  /\.product-shell-surface--community,\s*\.product-shell-surface--settings\s*\{[^}]*gap:\s*var\(--product-shell-gap\);[^}]*background:\s*transparent;/,
  "desktop community and settings chrome should expose the app canvas between independent surfaces",
);
assert.match(
  entryStyles,
  /\.product-shell-surface--settings > \.sessions,\s*\.product-shell-surface--settings > \.workspace\s*\{[^}]*border:\s*1px solid var\(--community-shell-stroke\);[^}]*border-radius:\s*var\(--community-shell-radius\);/,
  "desktop settings navigation and content should own independent panel frames",
);
assert.match(
  entryStyles,
  /\.product-shell-surface--community \.community-interaction-projection:is\(\.has-context-panel, \.has-drawer\)\s*\{[^}]*gap:\s*var\(--product-shell-gap\);[^}]*background:\s*var\(--surface-app\);/,
  "desktop context and detail modes should share one canvas-backed structural gap",
);
assert.match(
  entryStyles,
  /\.product-shell-surface--community \.community-interaction-projection > \.community-interaction-main,\s*\.product-shell-surface--community \.community-interaction-projection > \.community-interaction-drawer\s*\{[^}]*border:\s*1px solid var\(--community-shell-stroke\);[^}]*border-radius:\s*var\(--community-shell-radius\);/,
  "desktop chat and every canonical sidecar should own independent panel frames",
);
assert.match(
  featureStyles,
  /@container community-chat-area \(max-width: 680px\)[\s\S]*\.community-interaction-projection\.has-drawer \.community-interaction-drawer\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*z-index:\s*16;/,
  "narrow detail drawers should preserve their canonical full-area overlay behavior",
);
assert.doesNotMatch(
  entryStyles,
  /\.app-shell\.framed-shell\.with-community-rail\.community-layout\s*>\s*\.community-rail:not\(\.mobile-community-rail\)/,
  "the desktop global rail should remain unframed navigation infrastructure on the app canvas",
);
const railMainStart = communityRail.indexOf('<div className="rail-main">');
const railFooterStart = communityRail.indexOf('<div className="rail-footer">');
assert.ok(
  railMainStart >= 0 && railFooterStart > railMainStart,
  "the community rail must expose distinct main and fixed-footer regions",
);
const railMainMarkup = communityRail.slice(railMainStart, railFooterStart);
const railFooterMarkup = communityRail.slice(railFooterStart);
assert.match(
  railMainMarkup,
  /aria-label="Discover communities"[\s\S]*className="community-rail-list"/,
  "Discover must remain fixed before the scrollable community collection",
);
assert.doesNotMatch(
  railMainMarkup,
  /community-rail-add/,
  "Create community must not participate in community-list scrolling",
);
assert.match(
  railFooterMarkup,
  /community-rail-divider[\s\S]*community-rail-add[\s\S]*title="Settings"/,
  "the fixed rail footer must own Create community above Settings",
);
assert.match(
  featureStyles,
  /\.community-rail-button\s*\{[^}]*flex:\s*0 0 auto;/,
  "rail utility controls must never shrink below their canonical target size",
);
assert.match(
  featureStyles,
  /\.rail-main\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/,
  "the rail main region must constrain overflow without becoming the scroller",
);
assert.doesNotMatch(
  featureStyles,
  /\.rail-main\s*\{[^}]*overflow-y:\s*auto;/,
  "Discover and fixed rail actions must not share a scroll container",
);
assert.match(
  featureStyles,
  /\.community-rail-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/,
  "only the bounded community collection should own rail scrolling",
);
assert.match(
  featureStyles,
  /\.community-rail-list\s*\{[^}]*padding:\s*10px 0 12px;[^}]*scroll-padding-block:\s*10px 12px;/,
  "rail edge fades must reserve matching endpoint and keyboard-focus space",
);
assert.match(
  featureStyles,
  /\.community-rail-list\s*\{[^}]*-webkit-mask-image:\s*linear-gradient\([\s\S]*?transparent 0,[\s\S]*?#000 10px,[\s\S]*?#000 calc\(100% - 12px\),[\s\S]*?transparent 100%[\s\S]*?\);[^}]*mask-image:\s*linear-gradient\([\s\S]*?transparent 0,[\s\S]*?#000 10px,[\s\S]*?#000 calc\(100% - 12px\),[\s\S]*?transparent 100%[\s\S]*?\);/,
  "partial communities should dissolve against fixed rail controls in every theme",
);
assert.doesNotMatch(
  communityNav,
  /community-nav-banner-copy|activeCommunityOneLiner/,
  "the in-product community banner should stay a quiet identity surface without funnel copy",
);
assert.match(
  communityNav,
  /import \{ CommunityAvatar \} from "\.\/CommunityAvatar";[\s\S]*<CommunityAvatar[\s\S]*communityId=\{activeCommunity\?\.id\}[\s\S]*visualIdentity=\{activeCommunity\?\.visual_identity\}/,
  "community navigation should consume the canonical community identity component",
);
assert.doesNotMatch(
  communityNav,
  /UserAvatar|one_liner/,
  "community navigation should not fork user-avatar or funnel-copy authority",
);
assert.match(
  entryStyles,
  /\.community-nav \.nav-item\.active \{[\s\S]*background: var\(--surface-selected\);[\s\S]*box-shadow: inset 3px 0 0 var\(--accent-selection\);[\s\S]*color: var\(--text-selected\);/,
  "the desktop community selection state should consume semantic theme roles",
);
assert.doesNotMatch(
  entryStyles,
  /\.app-shell\.framed-shell\.with-community-rail\.community-layout\s*\{[^}]*(?:--bg-|--surface-|--text-|--accent-|--chat-link|--composer-|background:)/,
  "community shell layout must not become a second theme-token authority",
);
assert.doesNotMatch(
  entryStyles,
  /\.community-rail-button\.community-rail-community\s*\{[^}]*border-radius:/,
  "desktop community identities should retain the canonical rail shape",
);

const boundedFeatureOwners = [
  "apps/web/src/components/WebAppCompositionRoot.tsx",
  "apps/web/src/controllers/buildWebAuthShellProjection.ts",
  "apps/web/src/controllers/useWebAuthErrorToastLifecycle.ts",
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
  "apps/web/src/controllers/useWebMobileChromeReadingModeLifecycle.ts",
  "apps/web/src/controllers/useWebPendingAuthIntentController.ts",
  "apps/web/src/controllers/useWebPublicFunnelEntryController.ts",
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts",
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
    [
      "useState",
      "activePage",
      "communityTab",
      "readPublicRouteFromLocation",
      "readAppRouteFromLocation",
    ],
  ],
  [
    "apps/web/src/controllers/buildWebAuthShellProjection.ts",
    [
      "isLegacyWorkspaceRoutePath",
      "isRootAppRoutePath",
      "shouldHoldLandingForAuth",
    ],
  ],
  [
    "apps/web/src/controllers/useWebShellNavigationController.ts",
    ["useWebPathRouteLifecycle", "navigateTo", "pushNavSnapshot"],
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
assert.doesNotMatch(
  featureStyles,
  /\.workspace-selector\b|\.project-(?:selector|dropdown)\b|\.workspace-(?:payg|auto-recharge|billing)\b|\.modal-account-info\b|\.plan-grid\b|\.session-item\b/,
  "unreachable Workspace, project, session, and account-modal presentation must stay deleted",
);
assert.match(
  featureStyles,
  /\.billing-settings-error\b/,
  "surviving account-billing errors must use feature-owned presentation",
);
assert.match(
  entryStyles,
  /@import "\.\/base\.css";[\s\S]*@import "\.\/styles\/shell-and-onboarding\.css";[\s\S]*@import "\.\/styles\/community-and-content\.css";[\s\S]*@import "\.\/styles\/settings-runtime-and-theme-overrides\.css";/,
  "the web entry must preserve the explicit feature stylesheet cascade",
);

console.log("app_shell_decomposition_contract_proof: ok");
