import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const funnelActions = read("apps/web/src/controllers/useWebPublicFunnelActions.ts");
const funnelRoute = read("apps/web/src/controllers/useWebPublicCommunityRouteController.ts");
const funnelComponent = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const accessTypes = read("shared/communityTypes.ts");
const communityCore = read("convex/communityCore.ts");
const app = read("apps/web/src/App.tsx");

// --- The base load must MERGE into the same community, never replace it ---
// The memory graph + stats are folded in by async fetches; a bare replace on a
// re-fire drops them for a beat, which is the right-panel flicker.
assert.match(
  funnelActions,
  /setPublicCommunity\(\(prev\) =>[\s\S]{0,200}prev\.slug === resolvedSlug[\s\S]{0,160}\.\.\.prev,[\s\S]{0,80}\.\.\.loadedCommunity/,
  "the funnel base load must merge into prev on same-slug (keep memory/stats), never bare-replace the community",
);
assert.doesNotMatch(
  funnelActions,
  /setPublicCommunity\(\{/,
  "the funnel base load must not do a bare object-literal replace of the community — that drops merged memory/stats and flickers the panel",
);

// --- The funnel load follows the stable principal, never raw token identity ---
assert.match(
  app,
  /sessionDependency: canonicalSessionUserId/,
  "the funnel load effect dependency must follow the canonical authenticated principal",
);
assert.doesNotMatch(
  app,
  /sessionDependency: (?:Boolean\(session\)|session),/,
  "the funnel load must not depend on a sign-in boolean or raw session identity",
);

// --- Every async state commit is owned by one generation + route + principal ---
assert.match(
  funnelActions,
  /publicCommunityLoadGenerationRef/,
  "the public funnel loader must own an explicit request generation",
);
assert.match(
  funnelActions,
  /isPublicCommunityLoadSnapshotCurrent/,
  "the public funnel loader must validate its generation, route, and principal snapshot",
);
assert.match(
  funnelActions,
  /getCurrentPublicFunnelSlug/,
  "the public funnel loader must validate route authority rather than loaded community state",
);
assert.match(
  funnelActions,
  /getCurrentAuthSubject/,
  "the public funnel loader must validate principal authority",
);
assert.match(
  funnelActions,
  /resolveAuthSubject\(session\) !== authSubject/,
  "the credential used for access lookup must belong to the snapshotted principal",
);

// --- Preview has no access lookup; signed-in access fails closed until ready ---
assert.match(
  funnelRoute,
  /isPreviewMode: isPublicFunnelPreviewRoute/,
  "the route must explicitly identify preview loads",
);
const previewBypassIndex = funnelActions.indexOf("if (isPreviewMode || !hadSession) return;");
const guardedAccessLookupIndex = funnelActions.indexOf(
  "const access = await fetchCloudMyCommunityAccessBySlug",
  previewBypassIndex,
);
assert.ok(previewBypassIndex >= 0, "the loader must stop preview and anonymous access resolution");
assert.ok(
  guardedAccessLookupIndex > previewBypassIndex,
  "preview and anonymous loads must stop before the authenticated access lookup",
);
assert.match(
  funnelRoute,
  /const admissionIsReady = admission\.status === "ready";[\s\S]{0,400}admissionIsReady && publicFunnelAction/,
  "entry-policy CTAs must remain disabled until signed-in access is ready",
);
assert.match(
  funnelRoute,
  /params\.publicCommunity\?\.slug === publicFunnelSlug \? params\.publicCommunity : null/,
  "loaded community content must belong to the current funnel route",
);
assert.match(
  funnelComponent,
  /admissionStatus !== "ready"/,
  "the rendered public funnel action must fail closed outside ready admission",
);

// --- Blocking is canonical; duplicate backend CTA policy is deleted ---
assert.match(accessTypes, /is_blocked: boolean;/, "the shared access contract must expose blocking");
assert.doesNotMatch(accessTypes, /primary_cta/, "the shared access contract must not duplicate CTA policy");
assert.doesNotMatch(communityCore, /primary_cta|primaryCta|CommunityPrimaryCta/, "the backend access bundle must not compute unused CTA policy");

console.log(
  "community funnel load contract proof passed: one principal-bound generation, fail-closed admission, preview bypass, and no duplicate CTA policy.",
);
