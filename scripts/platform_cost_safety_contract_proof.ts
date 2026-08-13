import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const contract = read("docs/platform-cost-safety-contract-v1.md");
const docsIndex = read("docs/README.md");
const diagnosticsContract = read("docs/platform-diagnostics-contract-v1.md");
const crons = read("convex/crons.ts");
const attentionController = read("shared/useCommunityAttentionController.ts");
const attentionGateway = read("shared/cloudCommunityAttentionGateway.ts");
const attentionBackend = read("convex/communityAttention.ts");
const activeCommunityController = read(
  "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
);
const checkoutFinalizeController = read("shared/useCheckoutFinalizeController.ts");
const realtimeAuth = read("shared/convexRealtimeAuth.ts");

assert.match(
  contract,
  /No single client, tab, request, job, deployment, account, or community may[\s\S]*exhaust shared platform infrastructure spend/,
  "cost contract must preserve the irreducible isolation invariant",
);
assert.match(
  contract,
  /Product state, access, and entitlements[\s\S]*Founder-funded AI and tool usage[\s\S]*Convex\/Vercel\/provider invoices and spend limits/,
  "cost contract must keep product, founder-usage, and provider authorities distinct",
);
assert.match(
  diagnosticsContract,
  /platform-cost-safety-contract-v1\.md/,
  "platform diagnostics must link to the cost-safety authority",
);
assert.match(
  docsIndex,
  /platform-cost-safety-contract-v1\.md/,
  "active docs index must include the cost-safety contract",
);

const declaredCronNames = Array.from(
  crons.matchAll(/crons\.(?:interval|daily)\(\s*\n\s*"([^"]+)"/g),
  (match) => match[1]!,
);
assert.equal(declaredCronNames.length, 11, "every Convex cron must remain inventoried");
for (const cronName of declaredCronNames) {
  assert.ok(
    contract.toLowerCase().includes(cronName.toLowerCase()),
    `cost contract must inventory Convex cron: ${cronName}`,
  );
}
for (const retiredCronName of [
  "process queued community agent serve requests",
  "process queued community mention broadcasts",
  "process canceled community mention broadcast cleanups",
]) {
  assert.ok(
    !declaredCronNames.includes(retiredCronName),
    `fixed repair drain must remain deleted: ${retiredCronName}`,
  );
}

assert.match(
  contract,
  /Community attention subscription[\s\S]*one pooled realtime transport[\s\S]*no fixed poll[\s\S]*scope-bounded/,
  "cost contract must record the bounded reactive attention lifecycle",
);
assert.doesNotMatch(
  attentionController,
  /pollIntervalMs|window\.setInterval|refreshCommunityAttention|useResumeEpochEffect/,
  "attention must not retain fixed polling or manual lifecycle refreshes",
);
assert.match(
  attentionController,
  /createCloudCommunityChatLiveClient[\s\S]*subscribeCloudCommunityAttentionRows[\s\S]*unsubscribe\?\.\(\)[\s\S]*liveClient\?\.close\(\)/,
  "attention must reuse and release the pooled realtime transport",
);
assert.match(
  attentionController,
  /applyInFlightCommunityAttentionClears\([\s\S]*inFlightMarksRef\.current\.values\(\)[\s\S]*catch \(error\)[\s\S]*inFlightMarksRef\.current\.delete\(key\)[\s\S]*applyInFlightCommunityAttentionClears/,
  "attention rollback must preserve other concurrent optimistic acknowledgements",
);
assert.match(
  attentionGateway,
  /MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY[\s\S]*communityIdBatches[\s\S]*watchQuery[\s\S]*listMyCommunityAttention/,
  "attention subscriptions must chunk account growth into bounded backend executions",
);
assert.match(
  attentionBackend,
  /communityIds\.length > MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY[\s\S]*community_attention_scope_limit_exceeded/,
  "attention backend must reject oversized execution scopes before domain reads",
);
assert.match(
  attentionBackend,
  /MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES = 50[\s\S]*query\("communityResources"[\s\S]*take\(MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES\)[\s\S]*referencedModuleIds[\s\S]*ctx\.db\.get/,
  "resource attention must hydrate only modules referenced by a bounded recent-resource window",
);
assert.doesNotMatch(
  attentionBackend,
  /query\("communityResourceModules"[\s\S]{0,300}\.collect\(\)/,
  "resource attention must not collect every community resource module",
);
assert.match(
  activeCommunityController,
  /document\.visibilityState !== "visible"[\s\S]*window\.setInterval[\s\S]*COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS/,
  "presence heartbeat ground truth changed; update the cost contract",
);
assert.match(
  checkoutFinalizeController,
  /maxPendingAttempts \?\? 20[\s\S]*attempt <= maxAttempts[\s\S]*Math\.min\(8000/,
  "checkout-finalization retry bounds changed; update the cost contract",
);
assert.match(
  realtimeAuth,
  /REAUTH_RETRY_DELAYS_MS = \[1_000, 3_000, 10_000, 30_000\][\s\S]*resolveConvexRealtimeAuthRetryDelay\(retryAttempt\)[\s\S]*signalTerminalFailure\("auth_retry_exhausted"\)/,
  "realtime reauthentication must retain a finite terminal retry budget",
);
assert.match(
  realtimeAuth,
  /classifyConvexRealtimeTerminalFailure[\s\S]*deployment_disabled[\s\S]*deployment_paused[\s\S]*client\.watchQuery =/,
  "terminal deployment failures must be caught at the canonical realtime transport",
);
assert.match(
  realtimeAuth,
  /if \(entry\.terminalFailure\)[\s\S]*convex_realtime_dormant:/,
  "a retired terminal transport must not be recreated automatically",
);

for (const backlogId of [
  "COST-001",
  "COST-002",
  "COST-003",
  "COST-004",
  "COST-005",
  "COST-006",
  "COST-007",
  "COST-008",
  "COST-009",
  "COST-010",
  "COST-011",
  "COST-012",
]) {
  assert.match(contract, new RegExp(`\\| ${backlogId} \\|`), `missing ${backlogId}`);
}

assert.match(
  contract,
  /scheduled agent is advisory until narrower mutation authority is[\s\S]*explicitly approved/i,
  "scheduled agent must remain advisory by default",
);

console.log("platform_cost_safety_contract_proof: ok");
