import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const funnelActions = read("apps/web/src/controllers/useWebPublicFunnelActions.ts");
const funnelRoute = read("apps/web/src/controllers/useWebPublicCommunityRouteController.ts");
const funnelComponent = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
const accessTypes = read("shared/communityTypes.ts");
const communityCore = read("convex/communityCore.ts");
const app = read("apps/web/src/App.tsx");
const authResumeState = read("shared/authResumeState.ts");
const payFirst = read("shared/pay_first.ts");
const postAuthBilling = read("apps/web/src/controllers/useWebPostAuthBillingLifecycle.ts");
const admissionAction = read("apps/web/src/publicCommunityAdmissionAction.ts");
const routeState = read("shared/webAppRouteState.ts");

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

// --- Join/cancel responses have the same route, principal, and generation owner ---
assert.match(
  funnelActions,
  /publicCommunityActionGenerationRef/,
  "public admission mutations must own an explicit action generation",
);
assert.match(
  funnelActions,
  /isPublicCommunityAdmissionActionSnapshotCurrent/,
  "join and cancel responses must validate their action authority snapshot",
);
assert.match(
  funnelActions,
  /isPublicCommunityAdmissionActionOwner/,
  "only the active operation may clear shared admission loading state",
);
assert.doesNotMatch(
  funnelActions,
  /renderActionAuthorityKeyRef/,
  "route and subject changes must not mutate action authority during render",
);
assert.match(
  funnelActions,
  /useEffect\(\(\) => \{[\s\S]{0,300}active && actionSnapshotIsCurrent\(active\)[\s\S]{0,180}publicCommunityActionGenerationRef\.current \+= 1/,
  "committed route and subject changes must retain only a still-current action",
);
assert.match(
  funnelActions,
  /executePublicCommunityJoinAction/,
  "the React controller must execute the single testable join decision path",
);
assert.match(
  admissionAction,
  /export async function executePublicCommunityJoinAction[\s\S]{0,800}await args\.runJoin\(\)/,
  "the admission executor must own the asynchronous join outcome path",
);
assert.match(
  funnelActions,
  /reconcileAdmissionBySlug[\s\S]{0,1000}fetchCloudMyCommunityAccessBySlug/,
  "join and cancel must reconcile through the canonical community-access bundle",
);
assert.doesNotMatch(
  funnelActions,
  /applyApprovalJoinState|join_request_status:\s*(?:opts\.status|null)/,
  "the browser must not retain an optimistic join-request state owner",
);

// --- One bounded typed auth-resume record replaces indefinite duplicate join keys ---
assert.match(
  authResumeState,
  /AUTH_RESUME_STATE_TTL_MS/,
  "public join resume must use the bounded typed auth-resume record",
);
assert.match(
  authResumeState,
  /reason:\s*"join_public_community";[\s\S]{0,100}community_slug:\s*string/,
  "public join resume must be owned by the canonical funnel slug",
);
assert.match(
  authResumeState,
  /community_slug =[\s\S]{0,120}normalizeCommunitySlugIdentity\(payload\.community_slug\)/,
  "auth-resume community identity must be canonicalized once at ingress",
);
assert.match(
  routeState,
  /parsePublicCommunityFunnelRoutePath[\s\S]{0,500}normalizeCommunitySlugIdentity/,
  "public funnel routes must canonicalize slug identity before projection",
);
for (const source of [payFirst, postAuthBilling, app]) {
  assert.doesNotMatch(
    source,
    /PENDING_PUBLIC_JOIN|storePendingPublicJoin|readPendingPublicJoin|clearPendingPublicJoin/,
    "legacy pending-public-join storage and replay must remain deleted",
  );
}
assert.equal(
  existsSync("shared/usePendingPublicCommunityJoinController.ts"),
  false,
  "the unreferenced alternate public-join controller must remain deleted",
);
assert.match(
  app,
  /communitySlug:\s*payload\.community_slug,[\s\S]{0,80}origin:\s*"auth_resume"/,
  "post-auth join continuation must declare auth-resume authority explicitly",
);
assert.match(
  app,
  /communitySlug:\s*publicCommunityUi\.publicCommunity\.slug,[\s\S]{0,80}origin:\s*"funnel"/,
  "the live funnel join action must declare funnel authority explicitly",
);

// --- The browser has one strict slug-owned join RPC and never fabricates success ---
assert.match(
  payFirst,
  /joinPublicCommunityRpc[\s\S]{0,160}communitySlug:\s*string/,
  "the public join gateway must require the canonical community slug",
);
assert.doesNotMatch(
  payFirst,
  /joinPublicCommunityRpc[\s\S]{0,220}communityId\??:/,
  "the unused client ID join representation must remain deleted",
);
assert.doesNotMatch(
  payFirst,
  /client\.mutation\("community:joinPublicCommunity"\s+as any/,
  "the client gateway must not retain the unreferenced ID mutation path",
);
assert.match(
  payFirst,
  /return requirePublicCommunityJoinResult\(result\)/,
  "null and malformed join responses must fail closed through the strict result contract",
);
assert.doesNotMatch(
  payFirst,
  /result\s*\?\?\s*\{[\s\S]{0,100}outcome:\s*"joined"/,
  "the client gateway must never synthesize a joined result",
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
  "community funnel contract proof passed: canonical slug identity, strict join results, commit-safe action authority, executable admission decisions, bounded resume ownership, preview bypass, and no duplicate CTA policy.",
);
