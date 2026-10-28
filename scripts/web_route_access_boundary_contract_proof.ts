import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import type { AppPage } from "../shared/appShellNavigation.ts";
import type { PublicRoute } from "../shared/webAppRouteState.ts";
import {
  resolveWebRouteAccessProjection,
  shouldHydrateWebRouteAccountSetup,
  type WebRouteAuthState,
  type WebRouteScopedAccessState,
} from "../shared/webRouteAccess.ts";

const read = (path: string) => readFileSync(path, "utf8");
const app = read("apps/web/src/App.tsx");
const routeAccessHold = read("apps/web/src/components/WebRouteAccessHold.tsx");

function project(params: {
  publicRoute?: PublicRoute;
  activePage?: AppPage;
  pathname?: string;
  authState?: WebRouteAuthState;
  communitySlug?: string | null;
  communityAccessState?: WebRouteScopedAccessState;
  communityPreviewAccessState?: WebRouteScopedAccessState;
  operatorAccessState?: WebRouteScopedAccessState;
  accountSetupAccessState?: WebRouteScopedAccessState;
}) {
  return resolveWebRouteAccessProjection({
    publicRoute: params.publicRoute ?? { kind: "app" },
    activePage: params.activePage ?? "landing",
    pathname: params.pathname ?? "/",
    authState: params.authState ?? "signed_out",
    communitySlug: params.communitySlug ?? null,
    communityAccessState: params.communityAccessState,
    communityPreviewAccessState: params.communityPreviewAccessState,
    operatorAccessState: params.operatorAccessState,
    accountSetupAccessState: params.accountSetupAccessState,
  });
}

for (const pathname of ["/", "/m"] as const) {
  assert.deepEqual(project({ pathname }), {
    kind: "render_public",
    requirement: "member_entry",
  });
  assert.deepEqual(project({ pathname, authState: "recovering_signed_in" }), {
    kind: "hold",
    requirement: "member_entry",
  });
  assert.deepEqual(project({ pathname, authState: "verification_failed" }), {
    kind: "hold",
    requirement: "member_entry",
  });
  assert.deepEqual(project({ pathname, authState: "signed_in" }), {
    kind: "hold",
    requirement: "member_entry",
  });
}

for (const [activePage, pathname] of [
  ["discover", "/discover"],
  ["docs", "/docs"],
  ["settings", "/settings/billing"],
] as const) {
  assert.equal(
    shouldHydrateWebRouteAccountSetup({
      publicRoute: { kind: "app" },
      activePage,
      pathname,
    }),
    true,
    `${pathname} must hydrate the account state required by route admission`,
  );
  assert.deepEqual(project({ activePage, pathname }), {
    kind: "redirect_landing",
    requirement: "authenticated",
  });
  assert.deepEqual(
    project({
      activePage,
      pathname: `/m${pathname}`,
      authState: "recovering_signed_in",
    }),
    { kind: "hold", requirement: "authenticated" },
  );
  assert.deepEqual(project({ activePage, pathname, authState: "signed_in" }), {
    kind: "render_authenticated",
    requirement: "authenticated",
  });
}

for (const [publicRoute, activePage, pathname] of [
  [{ kind: "app" }, "landing", "/"],
  [{ kind: "community_funnel", slug: "polynet" }, "landing", "/c/polynet"],
  [{ kind: "app" }, "landing", "/workspace"],
] satisfies Array<[PublicRoute, AppPage, string]>) {
  assert.equal(
    shouldHydrateWebRouteAccountSetup({ publicRoute, activePage, pathname }),
    false,
    `${pathname} must not block public or legacy entry on account hydration`,
  );
}

for (const [publicRoute, activePage, pathname] of [
  [{ kind: "app" }, "onboarding", "/onboarding"],
  [{ kind: "app" }, "community", "/c/polynet/chat"],
  [{ kind: "app" }, "operator", "/operator/platform"],
] satisfies Array<[PublicRoute, AppPage, string]>) {
  assert.equal(
    shouldHydrateWebRouteAccountSetup({ publicRoute, activePage, pathname }),
    true,
    `${pathname} must hydrate account state before protected admission`,
  );
}

assert.deepEqual(
  project({ activePage: "onboarding", pathname: "/onboarding" }),
  {
  kind: "redirect_landing",
  requirement: "account_setup",
  },
);
assert.deepEqual(
  project({
    activePage: "onboarding",
    pathname: "/onboarding",
    authState: "signed_in",
    accountSetupAccessState: "denied",
  }),
  { kind: "render_authenticated", requirement: "account_setup" },
);
assert.deepEqual(
  project({
    activePage: "settings",
    pathname: "/settings/billing",
    authState: "signed_in",
    accountSetupAccessState: "resolving",
  }),
  { kind: "hold", requirement: "authenticated" },
);
assert.deepEqual(
  project({
    activePage: "settings",
    pathname: "/settings/billing",
    authState: "signed_in",
    accountSetupAccessState: "failed",
  }),
  { kind: "hold", requirement: "authenticated" },
);
assert.deepEqual(
  project({
    activePage: "settings",
    pathname: "/settings/billing",
    authState: "signed_in",
    accountSetupAccessState: "denied",
  }),
  { kind: "redirect_account_setup", requirement: "authenticated" },
);

assert.deepEqual(
  project({
    activePage: "community",
    pathname: "/c/polynet/chat",
    communitySlug: "polynet",
  }),
  {
    kind: "redirect_community_funnel",
    requirement: "community",
    communitySlug: "polynet",
  },
);
assert.deepEqual(
  project({
    activePage: "community",
    pathname: "/community",
    authState: "signed_in",
    communityAccessState: "resolving",
  }),
  { kind: "redirect_landing", requirement: "community" },
);
assert.deepEqual(
  project({
    activePage: "community",
    pathname: "/m/c/polynet/chat",
    authState: "signed_in",
    communitySlug: "polynet",
    communityAccessState: "resolving",
  }),
  { kind: "hold", requirement: "community" },
);
assert.deepEqual(
  project({
    activePage: "community",
    pathname: "/c/polynet/chat",
    authState: "signed_in",
    communitySlug: "polynet",
    communityAccessState: "failed",
  }),
  { kind: "hold", requirement: "community" },
);
assert.deepEqual(
  project({
    activePage: "community",
    pathname: "/c/polynet/chat",
    authState: "signed_in",
    communitySlug: "polynet",
    communityAccessState: "allowed",
  }),
  { kind: "render_authenticated", requirement: "community" },
);
assert.deepEqual(
  project({
    activePage: "community",
    pathname: "/c/polynet/chat",
    authState: "signed_in",
    communitySlug: "polynet",
    communityAccessState: "denied",
  }),
  {
    kind: "redirect_community_funnel",
    requirement: "community",
    communitySlug: "polynet",
  },
);

for (const publicRoute of [
  { kind: "community_funnel", slug: "polynet" },
  { kind: "checkout_success", sessionId: "checkout" },
  { kind: "claim", token: "claim" },
] satisfies PublicRoute[]) {
  assert.deepEqual(
    project({ publicRoute, authState: "recovering_signed_in" }),
    { kind: "render_public", requirement: "public" },
  );
}

assert.deepEqual(
  project({
    activePage: "operator",
    pathname: "/operator/platform",
    authState: "signed_in",
    operatorAccessState: "resolving",
  }),
  { kind: "hold", requirement: "operator" },
);
assert.deepEqual(
  project({
    activePage: "operator",
    pathname: "/operator/platform",
    authState: "signed_in",
    operatorAccessState: "failed",
  }),
  { kind: "hold", requirement: "operator" },
);
assert.deepEqual(
  project({
    activePage: "operator",
    pathname: "/operator/platform",
    authState: "signed_in",
    operatorAccessState: "allowed",
  }),
  { kind: "render_authenticated", requirement: "operator" },
);
assert.deepEqual(
  project({
    activePage: "operator",
    pathname: "/operator/platform",
    authState: "signed_in",
    operatorAccessState: "denied",
  }),
  { kind: "redirect_member_entry", requirement: "operator" },
);

assert.deepEqual(project({ pathname: "/workspace", authState: "signed_in" }), {
  kind: "hold",
  requirement: "legacy_entry",
});

const boundary = read(
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts",
);
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorIdentity = read(
  "apps/web/src/controllers/useWebAuthenticatedIdentityController.ts",
);
const memberEntryGateway = read(
  "shared/cloudMemberEntryDestinationGateway.ts",
);
const asyncDeadline = read("shared/asyncDeadline.ts");
const onboarding = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const shellProjection = read(
  "apps/web/src/controllers/buildWebShellProjection.ts",
);
const shellChromeProjection = read(
  "apps/web/src/controllers/buildWebShellChromeHostProps.ts",
);
const publicFunnelActions = read(
  "apps/web/src/controllers/useWebPublicFunnelActions.ts",
);
const packageJson = read("package.json");
const foundationGate = read("scripts/foundation_baseline_gate.sh");

assert.equal(
  existsSync(
    "apps/web/src/controllers/useWebJoinedCommunityRouteResolution.ts",
  ),
  false,
  "the independent joined-community redirect owner must stay deleted",
);
assert.match(app, /useWebRouteAccessBoundaryController/);
assert.match(
  app,
  /shouldHydrateWebRouteAccountSetup\([\s\S]*shouldHydrateAccountSetup,/,
  "the app must pass canonical route-driven account hydration into the profile controller",
);
assert.match(
  onboarding,
  /!params\.shouldHydrateAccountSetup/,
  "account hydration must consume the canonical route decision",
);
assert.doesNotMatch(
  onboarding,
  /params\.activePage === "settings"|params\.activePage === "community"|params\.activePage === "onboarding"/,
  "account hydration must not drift behind a page-name allowlist",
);
assert.doesNotMatch(
  app,
  /Opening Polynet…|landing-auth-hold-content/,
  "normal route admission must not replace the shell with a branded interstitial",
);
assert.match(
  app,
  /if \(shouldHoldRouteForAccess\) \{[\s\S]*<WebRouteAccessHold[\s\S]*shellChromeHostProps=\{shellChromeHostProps\}[\s\S]*mainSurfaceHostProps=\{mainSurfaceHostProps\}/,
  "a held route must preserve canonical shell composition",
);
assert.match(
  routeAccessHold,
  /<WebShellChromeHost[\s\S]*<WebAppMainSurfaceFallback[\s\S]*quiet[\s\S]*globalOverlays=\{null\}/,
  "the access hold must reuse canonical shell and surface fallback owners without overlays",
);
assert.match(
  routeAccessHold,
  /node\.inert = true[\s\S]*aria-hidden="true"/,
  "unverified shell geometry must remain non-interactive and hidden from assistive technology",
);
for (const protectedProjection of [
  /activeCommunity: null/,
  /communityChannels: \[\]/,
  /memberFaces: \[\]/,
  /communities: \[\]/,
  /railCommunities: \[\]/,
  /canOpenDirectMessages: false/,
] as const) {
  assert.match(
    routeAccessHold,
    protectedProjection,
    "the held shell must not project protected community or messaging data",
  );
}
assert.match(
  routeAccessHold,
  /props\.errorMessage \?\? "Polynet could not finish verifying your session\."[\s\S]*Try again/,
  "a held route must expose visible, recoverable failure UI only after a real error",
);
assert.match(
  routeAccessHold,
  /setTimeout\(\(\) => setShowProgress\(true\), 500\)[\s\S]*role="status"[\s\S]*Opening Polynet…/,
  "a slow healthy admission must explain its progress without replacing the held shell",
);
assert.match(
  app,
  /useWebCommunityAgentSurfaceController[\s\S]*if \(shouldHoldRouteForAccess\) \{[\s\S]*WebRouteAccessHold/,
  "the composition root must hold before rendering authorized overlays",
);
assert.match(
  boundary,
  /params\.navigateTo\(destination, \{ replace: true \}\)/,
);
assert.match(boundary, /setCommunityResolution\(\{ slug, state: "denied" \}\)/);
assert.match(
  boundary,
  /catch \(error\)[\s\S]*setCommunityResolution\(\{ slug, state: "failed" \}\)[\s\S]*communityResolutionError[\s\S]*retryCommunityResolution/,
  "unavailable community authority must stay held and retryable rather than becoming a denial",
);
assert.match(
  asyncDeadline,
  /APP_ADMISSION_TIMEOUT_MS = 10_000/,
  "route admission must share one finite deadline",
);
for (const [name, source, code] of [
  ["operator access", operatorGateway, "operator_access_resolution_timeout"],
  ["member entry", memberEntryGateway, "member_entry_destination_timeout"],
] as const) {
  assert.match(
    source,
    new RegExp(`withAsyncDeadline\\([\\s\\S]*${code}`),
    `${name} authority must terminate instead of holding the shell forever`,
  );
  assert.match(
    source,
    /timeoutMs: APP_ADMISSION_TIMEOUT_MS/,
    `${name} authority must use the canonical admission deadline`,
  );
}
assert.match(
  operatorIdentity,
  /operatorAccessError[\s\S]*retryOperatorAccess/,
  "transient operator authority failure must remain held and retryable",
);
assert.match(
  app,
  /operatorAccessError[\s\S]*retryOperatorAccess\(\)/,
  "operator route recovery must stay in-app",
);
assert.doesNotMatch(
  onboarding,
  /activePage !== "onboarding"[\s\S]{0,240}requireSignIn/,
  "direct onboarding navigation must not launch authentication",
);
assert.match(
  onboarding,
  /params\.activePage !== "onboarding"[\s\S]*routeTryPolynetFree\(params\.session\)/,
  "direct authenticated onboarding navigation must resolve canonical profile, setup, and completed-account destination state",
);
assert.match(
  shellProjection,
  /const showDesktopCommunityRail =\s*isAppRoute/,
  "the public community funnel must not expose authenticated global navigation",
);
assert.match(
  shellChromeProjection,
  /canOpenCommunitySelector: !params\.isPublicCommunityFunnel/,
  "the mobile public funnel must not expose the authenticated community selector",
);
assert.match(
  app,
  /sessionDependency: resolveAuthSubject\(session\)/,
  "public funnel access must refresh when the authenticated subject changes",
);
assert.match(
  publicFunnelActions,
  /resolveAuthSubject\(current\.getSession\(\)\) !== accessSubject/,
  "an obsolete subject must never publish a public-funnel access result",
);
assert.match(packageJson, /"check:web-route-access-boundary-proof"/);
assert.match(
  foundationGate,
  /Web route access boundary proof" npm run check:web-route-access-boundary-proof/,
);

console.log(
  "web_route_access_boundary_contract_proof: canonical public, authenticated, community, operator, and mobile route matrix ok",
);
