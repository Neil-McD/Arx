import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import type { AppPage } from "../shared/appShellNavigation.ts";
import type { PublicRoute } from "../shared/webAppRouteState.ts";
import {
  resolveWebRouteAccessProjection,
  type WebRouteAuthState,
  type WebRouteScopedAccessState,
} from "../shared/webRouteAccess.ts";

const read = (path: string) => readFileSync(path, "utf8");

function project(params: {
  publicRoute?: PublicRoute;
  activePage?: AppPage;
  pathname?: string;
  authState?: WebRouteAuthState;
  communitySlug?: string | null;
  communityAccessState?: WebRouteScopedAccessState;
  communityPreviewAccessState?: WebRouteScopedAccessState;
  operatorAccessState?: WebRouteScopedAccessState;
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
  assert.deepEqual(project({ pathname, authState: "signed_in" }), {
    kind: "hold",
    requirement: "member_entry",
  });
}

for (const [activePage, pathname] of [
  ["discover", "/discover"],
  ["docs", "/docs"],
  ["settings", "/settings/billing"],
  ["onboarding", "/onboarding"],
] as const) {
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
  assert.deepEqual(
    project({ activePage, pathname, authState: "signed_in" }),
    { kind: "render_authenticated", requirement: "authenticated" },
  );
}

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

const previewRoute: PublicRoute = {
  kind: "community_funnel_preview",
  slug: "polynet",
};
assert.deepEqual(project({ publicRoute: previewRoute }), {
  kind: "redirect_community_funnel",
  requirement: "community_preview",
  communitySlug: "polynet",
});
assert.deepEqual(
  project({
    publicRoute: previewRoute,
    authState: "signed_in",
    communityPreviewAccessState: "resolving",
  }),
  { kind: "hold", requirement: "community_preview" },
);
assert.deepEqual(
  project({
    publicRoute: previewRoute,
    authState: "signed_in",
    communityPreviewAccessState: "denied",
  }),
  {
    kind: "redirect_community_funnel",
    requirement: "community_preview",
    communitySlug: "polynet",
  },
);
assert.deepEqual(
  project({
    publicRoute: previewRoute,
    authState: "signed_in",
    communityPreviewAccessState: "allowed",
  }),
  { kind: "render_authenticated", requirement: "community_preview" },
);

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

assert.deepEqual(
  project({ pathname: "/workspace", authState: "signed_in" }),
  { kind: "hold", requirement: "legacy_entry" },
);

const app = read("apps/web/src/App.tsx");
const boundary = read(
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts",
);
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
  /useWebMemberAgentSurfaceController[\s\S]*if \(shouldHoldRouteForAccess\) \{[\s\S]*landing-auth-hold/,
  "the composition root must hold before rendering unauthorized chrome",
);
assert.match(boundary, /params\.navigateTo\(destination, \{ replace: true \}\)/);
assert.match(boundary, /setCommunityResolution\(\{ slug, state: "denied" \}\)/);
assert.doesNotMatch(
  onboarding,
  /activePage !== "onboarding"[\s\S]{0,240}requireSignIn/,
  "direct onboarding navigation must not launch authentication",
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
  "web_route_access_boundary_contract_proof: canonical public, authenticated, community, preview, operator, and mobile route matrix ok",
);
