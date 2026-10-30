import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const RECURRING_SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const RECURRING_SOURCE_EXCLUDED_DIRECTORIES = new Set([
  "_generated",
  "build",
  "dist",
  "node_modules",
]);

function listRecurringSourceFiles(relativeDirectory: string): string[] {
  const entries = readdirSync(new URL(`../${relativeDirectory}/`, import.meta.url), {
    withFileTypes: true,
  });
  return entries.flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      return RECURRING_SOURCE_EXCLUDED_DIRECTORIES.has(entry.name)
        ? []
        : listRecurringSourceFiles(relativePath);
    }
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    return entry.isFile() && RECURRING_SOURCE_EXTENSIONS.has(extension)
      ? [relativePath]
      : [];
  });
}

function listSetIntervalCallSites(): Array<{ file: string; line: number }> {
  const sourceFiles = [
    ...listRecurringSourceFiles("apps/web/src"),
    ...listRecurringSourceFiles("convex"),
    ...listRecurringSourceFiles("shared"),
  ];
  return sourceFiles.flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((line, index) => {
        const matches = line.match(/\b(?:(?:globalThis|window)\.)?setInterval\s*\(/g) ?? [];
        return matches.map(() => ({ file, line: index + 1 }));
      }),
  );
}

const contract = read("docs/platform-cost-safety-contract-v1.md");
const docsIndex = read("docs/README.md");
const diagnosticsContract = read("docs/platform-diagnostics-contract-v1.md");
const crons = read("convex/crons.ts");
const emailCore = read("convex/emailCore.ts");
const attentionController = read("shared/useCommunityAttentionController.ts");
const attentionGateway = read("shared/cloudCommunityAttentionGateway.ts");
const attentionBackend = read("convex/communityAttention.ts");
const activeCommunityController = read(
  "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
);
const publicCommunityRouteController = read(
  "apps/web/src/controllers/useWebPublicCommunityRouteController.ts",
);
const checkoutFinalizeController = read("shared/useCheckoutFinalizeController.ts");
const realtimeAuth = read("shared/convexRealtimeAuth.ts");
const runtimeCancellation = read("convex/runtimeCancellation.ts");
const communityPresenceContract = read("shared/communityPresenceContract.ts");
const schema = read("convex/schema.ts");
const communityHeartbeat = read("convex/communityAgentHeartbeat.ts");
const communityDirectory = read("convex/communityIntelligenceDirectory.ts");

const uiOnlyIntervalFiles = [
  "apps/web/src/components/ChannelRosterPanel.tsx",
  "apps/web/src/components/RuntimeLiveTimeline.tsx",
  "shared/useCommunityTypingPresence.ts",
  "shared/useDirectMessageTypingPresence.ts",
  "apps/web/src/components/WebTestRunBar.tsx",
] as const;
const costBearingIntervalFiles = [
  "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
  "apps/web/src/controllers/useWebPublicCommunityRouteController.ts",
  "convex/runtimeCancellation.ts",
  "apps/web/src/components/WebCommunityPods.tsx",
  "apps/web/src/components/WebCommunitySettingProposals.tsx",
  "apps/web/src/components/WebCommunityWelcome.tsx",
  "apps/web/src/components/WebTestRunBar.tsx",
  "apps/web/src/components/WebCommunityWorkflowChanges.tsx",
  "apps/web/src/components/WebCommunityWorkflowsSection.tsx",
] as const;
const expectedIntervalFiles = [...uiOnlyIntervalFiles, ...costBearingIntervalFiles].sort();
const actualIntervalCallSites = listSetIntervalCallSites();
assert.deepEqual(
  actualIntervalCallSites.map(({ file }) => file).sort(),
  expectedIntervalFiles,
  `setInterval inventory drifted: ${actualIntervalCallSites
    .map(({ file, line }) => `${file}:${line}`)
    .join(", ")}`,
);
for (const file of expectedIntervalFiles) {
  assert.ok(contract.includes(`\`${file}\``), `cost contract must classify interval: ${file}`);
}
assert.match(
  publicCommunityRouteController,
  /params\.isSignedIn \|\| !admission\.approvalPending[\s\S]*inFlight[\s\S]*document\.visibilityState === "hidden"[\s\S]*setInterval\(onResume, 30_000\)[\s\S]*clearInterval\(timer\)/,
  "pending public access refresh must be scoped, serialized, visibility-gated, and torn down",
);

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
assert.equal(declaredCronNames.length, 6, "every Convex cron must remain inventoried");
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
  "process pending community agent mentions",
]) {
  assert.ok(
    !declaredCronNames.includes(retiredCronName),
    `fixed repair drain must remain deleted: ${retiredCronName}`,
  );
}
assert.doesNotMatch(
  crons,
  /emailDigests|weekly_(?:member|founder)_digest/,
  "weekly digest delivery must stay disabled until its bounded worker is proven",
);
assert.doesNotMatch(
  communityHeartbeat,
  /query\("communities" as any\)\.take\(limit\)/,
  "community memory sweep must not enumerate idle communities",
);
assert.match(
  schema,
  /by_memoryMetabolismPending_requestedAt[\s\S]*by_compilerState_pendingSince[\s\S]*by_agentHandoffState_createdAt[\s\S]*by_agentHandoffState_agentClaimedAt/,
  "community memory sweep must discover work through bounded due-work indexes",
);
assert.match(
  communityDirectory,
  /memoryMetabolismPending: true[\s\S]*memoryMetabolismRevision[\s\S]*memoryMetabolismRequestedAt: nowMs|memoryMetabolismRevision[\s\S]*memoryMetabolismPending: true[\s\S]*memoryMetabolismRequestedAt: nowMs/,
  "new memory outcomes must mark their community for due-work discovery",
);
assert.match(
  communityHeartbeat,
  /currentRevision !== args\.revision[\s\S]*newer_memory_work[\s\S]*memoryMetabolismPending: false/,
  "community memory settlement must preserve newer concurrent work",
);
assert.match(
  emailCore,
  /"weekly_member_digest"[\s\S]*case "weekly_member_digest"/,
  "the protected weekly member digest renderer must remain available",
);
assert.doesNotMatch(
  emailCore,
  /weekly_founder_digest/,
  "the unused founder digest duplicate must remain deleted",
);
assert.match(
  contract,
  /Weekly community digests are a protected MVP engagement requirement[\s\S]*at most 5 communities claimed[\s\S]*at most 50 recipients from one community batch[\s\S]*at most 100 recipients across the entire run[\s\S]*at most 8 rendered content items/,
  "weekly digest requirement and hard cost ceilings must remain explicit",
);
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
  /subscribeCommunityPages[\s\S]*watchQuery[\s\S]*listMyCommunityAttentionPage[\s\S]*numItems: 10/,
  "attention subscriptions must bound each execution to one community and a channel page",
);
assert.match(
  attentionBackend,
  /listMyCommunityAttentionPage = query\([\s\S]*numItems: Math\.min\(10, args\.paginationOpts\.numItems\)/,
  "attention backend reads one community and at most ten channels per execution",
);
assert.doesNotMatch(attentionBackend, /export const listMyCommunityAttention = query/, "the unpaged multi-community attention query stays deleted");
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
  communityPresenceContract,
  /COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000/,
  "presence heartbeat must retain its declared 30-second cadence",
);
assert.match(
  activeCommunityController,
  /if \(cancelled \|\| inFlight \|\| document\.visibilityState !== "visible"\) return[\s\S]*window\.setInterval[\s\S]*cancelled = true[\s\S]*window\.clearInterval\(intervalId\)/,
  "presence heartbeat must prevent overlap and stop on teardown",
);
assert.match(
  runtimeCancellation,
  /let pollInFlight = false[\s\S]*Math\.max\([\s\S]*100[\s\S]*setInterval[\s\S]*pollInFlight = true[\s\S]*finally\(\(\) => \{[\s\S]*pollInFlight = false[\s\S]*finally \{[\s\S]*clearInterval\(intervalId\)/,
  "runtime cancellation polling must be bounded, non-overlapping, and execution-scoped",
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
