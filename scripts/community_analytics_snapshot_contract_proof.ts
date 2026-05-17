import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assertIncludes(source: string, needle: string, label: string): void {
  assert.ok(source.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(source: string, needle: string, label: string): void {
  assert.ok(!source.includes(needle), `expected ${label} not to include ${needle}`);
}

const communityAdmin = read("convex/communityAdmin.ts");
const communityExports = read("convex/community.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const controller = read("shared/useCommunityAdminController.ts");
const analyticsLifecycle = read("shared/useCommunityAdminAnalyticsLifecycle.ts");
const analyticsChart = read("shared/AnalyticsLineChart.tsx");
const adminCore = read("shared/communityAdminCore.ts");
const communityTypes = read("shared/communityTypes.ts");

assertIncludes(
  communityAdmin,
  "export const getCommunityAnalyticsSnapshot = query({",
  "backend snapshot query",
);
assertIncludes(
  communityAdmin,
  ".take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS)",
  "snapshot visit rows are capped",
);
assertIncludes(
  communityAdmin,
  "series: {",
  "snapshot returns chart series",
);
assertIncludes(
  communityAdmin,
  "visits: buildAnalyticsCountSeries({",
  "snapshot builds visit series server-side",
);
assertIncludes(
  communityAdmin,
  "members: buildAnalyticsCountSeries({",
  "snapshot builds member series server-side",
);
assertIncludes(
  communityAdmin,
  "revenue: mixedCurrency",
  "snapshot builds revenue series server-side",
);
assertIncludes(
  communityExports,
  "export const getCommunityAnalyticsSnapshot = getCommunityAnalyticsSnapshotImpl;",
  "community module exports snapshot query",
);
assertIncludes(
  adminGateway,
  '"community:getCommunityAnalyticsSnapshot"',
  "admin gateway calls snapshot query",
);
assertIncludes(
  communityTypes,
  "export type CommunityAnalyticsSnapshot = {",
  "shared type defines analytics snapshot",
);
assertIncludes(
  controller,
  "fetchCloudCommunityAnalyticsSnapshot({",
  "controller loads snapshot",
);
assertNotIncludes(
  controller,
  "listCloudCommunityFunnelVisitCreatedAtRows",
  "controller does not fetch raw visit rows",
);
assertNotIncludes(
  controller,
  "listCloudCommunityMembershipCreatedAtRows",
  "controller does not fetch raw membership rows",
);
assertNotIncludes(
  controller,
  "buildAnalyticsSeries",
  "controller does not bucket analytics client-side",
);
assertNotIncludes(
  adminCore,
  "export function buildAnalyticsSeries",
  "dead client-side count bucketing helper is removed",
);
assertNotIncludes(
  adminCore,
  "export function buildAnalyticsValueSeries",
  "dead client-side value bucketing helper is removed",
);
assertNotIncludes(
  analyticsLifecycle,
  "getCommunityCreatedAt",
  "analytics lifecycle does not pass community created_at for client bucketing",
);
assertIncludes(
  analyticsChart,
  "useId",
  "chart uses stable per-instance ids",
);
assertIncludes(
  analyticsChart,
  "analyticsAreaGradient-${reactId.replace(/:/g, \"\")}",
  "chart gradient id is instance-scoped",
);

console.log("community_analytics_snapshot_contract_proof: ok");
