import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function extractBetween(source: string, startMarker: string, endMarker: string, label: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${label} start marker is missing`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${label} end marker is missing`);
  return source.slice(start, end);
}

const schema = read("convex/schema.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const communitySubscriptionAccessCore = read("convex/communitySubscriptionAccessCore.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const businessAnalytics = read("convex/businessAnalytics.ts");
const businessAnalyticsCore = read("convex/businessAnalyticsCore.ts");
const communityPublic = read("convex/communityPublic.ts");
const cloudBusinessAnalyticsGateway = read("shared/cloudBusinessAnalyticsGateway.ts");
const cloudPublicFunnelGateway = read("shared/cloudPublicFunnelGateway.ts");
const webApp = read("apps/web/src/App.tsx");
const webLandingPage = read("apps/web/src/components/WebLandingPage.tsx");
const monetizationQuery = extractBetween(
  operatorIntelligence,
  "export const getOperatorMonetizationInternal = internalQuery",
  "export const listOperatorEventsInternal = internalQuery",
  "operator monetization query",
);
const communityListQuery = extractBetween(
  operatorIntelligence,
  "export const listOperatorCommunitiesInternal = internalQuery",
  "export const listOperatorDeveloperAppPolicyAuditInternal = internalQuery",
  "operator communities query",
);
const platformBusinessVisitSchema = extractBetween(
  schema,
  "platformBusinessVisits: defineTable",
  "communityPricePoints: defineTable",
  "platform business visit schema",
);
const communityAnalyticsEventSchema = extractBetween(
  schema,
  "communityAnalyticsEvents: defineTable",
  "platformBusinessVisits: defineTable",
  "community analytics event schema",
);
const recordBusinessVisitMutation = extractBetween(
  businessAnalytics,
  "export const recordBusinessPageVisit = mutation",
  "export const identifyBusinessVisitor = mutation",
  "business visit record mutation",
);
const publicFunnelVisitMutation = extractBetween(
  communityPublic,
  "export const recordPublicFunnelVisitBySlug = mutation",
  "export const heartbeatCommunityPresence = mutation",
  "public funnel visit mutation",
);
const publicFunnelAnalyticsInsert = extractBetween(
  publicFunnelVisitMutation,
  'await ctx.db.insert("communityAnalyticsEvents"',
  "});",
  "public funnel analytics insert",
);

for (const [table, indexes] of [
  ["checkoutSessions", ["by_mode_status", "by_community_status"]],
  ["communitySubscriptions", ["by_status", "by_community_status"]],
] as const) {
  assert.match(schema, new RegExp(`${table}: defineTable[\\s\\S]*${indexes[0]}`), `${table} missing ${indexes[0]}`);
  assert.match(schema, new RegExp(`${table}: defineTable[\\s\\S]*${indexes[1]}`), `${table} missing ${indexes[1]}`);
}

assert.match(
  operatorTypes,
  /export type OperatorCommunityRecord = /,
  "operator community record contract is missing",
);
assert.match(communityListQuery, /records\.sort\(/, "operator communities should sort before applying the limit");
assert.match(
  communityListQuery,
  /estimatedMrr\?\.amountBaseUnits/,
  "operator communities should rank by estimated MRR",
);
assert.ok(
  communityListQuery.indexOf("records.sort(") < communityListQuery.indexOf("return records.slice(0, limit)"),
  "operator communities must sort all matching records before slicing to the panel limit",
);
assert.match(operatorTypes, /export type OperatorOverviewSnapshot = /, "operator overview contract is missing");
assert.match(operatorTypes, /export type OperatorMonetizationSnapshot = /, "operator monetization contract is missing");
assert.match(operatorTypes, /creditTopupCheckoutStarts: number/, "operator monetization should track credit top-up starts");
assert.doesNotMatch(
  operatorTypes,
  new RegExp("buil" + "derPlanCheckoutStarts: number"),
  "operator monetization must not foreground deprecated paid-plan checkout starts",
);
assert.match(operatorTypes, /export type OperatorRiskItem = /, "operator risk contract is missing");
assert.match(operatorTypes, /export type OperatorEventRecord = /, "operator event contract is missing");
assert.doesNotMatch(operatorTypes, /OperatorToolDefinition|OperatorDashboardSection/, "unused operator tool scaffold must stay deleted");

for (const queryName of [
  "getOperatorOverviewInternal",
  "listOperatorCommunitiesInternal",
  "getOperatorCommunitySnapshotInternal",
  "getOperatorMonetizationInternal",
  "listOperatorRisksInternal",
  "listOperatorEventsInternal",
]) {
  assert.match(
    operatorIntelligence,
    new RegExp(`export const ${queryName} = internalQuery`),
    `missing read-only internal query ${queryName}`,
  );
}

assert.doesNotMatch(
  operatorIntelligence,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator intelligence must stay read-only",
);

assert.match(
  operatorIntelligence,
  /criticalAuditEvents/,
  "operator intelligence must source the critical audit ledger",
);

assert.match(
  operatorIntelligence,
  /monthlyMoneyFromPricePoint/,
  "operator MRR must normalize subscription price points by billing period",
);

assert.doesNotMatch(
  operatorIntelligence,
  /multiplyMoney|multiplyMoney\(currentPrice|amountBaseUnits:\s*metric\.amountBaseUnits\s*\*\s*multiplier/,
  "operator MRR must not multiply current price by paid member count",
);

assert.match(
  operatorIntelligence,
  /COMMUNITY_SUBSCRIPTION_ACCESS_STATUSES/,
  "operator MRR should reuse the canonical granting-status policy",
);
assert.match(
  communitySubscriptionAccessCore,
  /COMMUNITY_SUBSCRIPTION_ACCESS_STATUSES = new Set<[\s\S]*?\(\["active", "past_due", "cancel_at_period_end"\]\)/,
  "canonical access policy should include every revenue-bearing subscription status",
);

assert.match(
  operatorIntelligence,
  /CHECKOUT_STATUSES = \["pending", "complete", "expired"\]/,
  "operator checkout starts must include expired checkout sessions",
);
assert.match(
  operatorIntelligence,
  /row\.mode === "workspace_credit_topup"/,
  "operator monetization should treat credits as the paid-tool checkout signal",
);
assert.match(
  operatorTypes,
  /businessKpis\?:/,
  "operator monetization should expose the canonical business KPI contract",
);
assert.match(
  operatorTypes,
  /activePayingCustomers: number/,
  "operator business KPIs should expose active paying users",
);
assert.match(
  operatorTypes,
  /communityPlatformRevShareInRange: OperatorMoneyMetric \| null/,
  "operator business KPIs should expose community rev-share separately from gross community revenue",
);
assert.doesNotMatch(
  operatorTypes,
  /accountSetupCompleted: number|accountSetupCompletionRate: number \| null/,
  "operator monetization KPIs must not duplicate account setup snapshot fields",
);
assert.match(
  operatorTypes,
  /usageBuyersInRange: number/,
  "operator business KPIs should expose usage buyers",
);
assert.match(
  operatorTypes,
  /activatedCommunityCreators: number/,
  "operator business KPIs should expose activated community creators",
);
assert.match(
  operatorTypes,
  /communityCreatorActivationRate: number \| null/,
  "operator business KPIs should expose community creator activation rate",
);
assert.match(
  operatorTypes,
  /communitiesWithFirstMember: number/,
  "operator business KPIs should expose community first-member activation",
);
assert.match(
  operatorTypes,
  /paidCommunitiesWithMembers: number/,
  "operator business KPIs should expose paid communities with members",
);
assert.match(
  operatorTypes,
  /averageRecordedLifetimeValue: OperatorMoneyMetric \| null/,
  "operator business KPIs should label first-party checkout LTV explicitly",
);
assert.match(
  schema,
  /platformBusinessVisits: defineTable/,
  "operator visitor KPIs should have a first-party business visit table",
);
assert.match(
  platformBusinessVisitSchema,
  /visitorKeyHash: v\.string\(\)/,
  "business visit table must store hashed visitor keys only",
);
assert.doesNotMatch(
  platformBusinessVisitSchema,
  /visitorKey(?!Hash)|rawUrl|fullUrl|queryString|searchParams|referrer|userAgent|ipAddress/i,
  "business visit table must not store raw visitor keys, URLs, queries, referrers, user agents, or IP addresses",
);
assert.match(
  platformBusinessVisitSchema,
  /by_visitor_scope_bucket/,
  "business visits should dedupe by visitor, path, scope, and bucket",
);
assert.match(
  platformBusinessVisitSchema,
  /by_visitor_hash_createdAt/,
  "business visitor identification should have an efficient visitor-hash lookup",
);
assert.match(
  businessAnalyticsCore,
  /crypto\.subtle\.digest\("SHA-256"/,
  "business visitor keys should be hashed server-side",
);
assert.match(
  businessAnalytics,
  /pathKind: v\.union\(v\.literal\("home"\), v\.literal\("community_funnel"\)\)/,
  "business visit ingestion should only accept known path kinds",
);
assert.doesNotMatch(
  recordBusinessVisitMutation,
  /authSubject|resolveAuthenticatedSubject|ctx\.db\.patch|\buserId\b/,
  "public business visit ingestion must not trust client-supplied identity",
);
assert.match(
  cloudBusinessAnalyticsGateway,
  /source: resolveBusinessVisitSource\(\)/,
  "business visit client should send only a source bucket",
);
assert.match(
  cloudBusinessAnalyticsGateway,
  /visitorKey: visitorKey \?\? undefined/,
  "business visit client should omit unavailable visitor keys instead of sending null",
);
assert.match(
  businessAnalytics,
  /export const identifyBusinessVisitor = mutation/,
  "business analytics should expose a dedicated visitor identification mutation",
);
assert.match(
  businessAnalytics,
  /findAuthenticatedActorState\(\{[\s\S]*ctx,[\s\S]*authSubject: args\.authSubject[\s\S]*actor\.dbUserId/,
  "business visitor identification should use the canonical verified actor",
);
assert.match(
  businessAnalytics,
  /withIndex\("by_visitor_hash_createdAt"/,
  "business visitor identification should patch visits through the visitor hash index",
);
assert.match(
  businessAnalytics,
  /ctx\.db\.patch\(row\._id, \{ userId, updatedAt: nowMs \}\)/,
  "business visitor identification should attach user id to prior visit rows",
);
assert.match(
  cloudBusinessAnalyticsGateway,
  /bootstrapConvexAuthenticatedClient/,
  "business visitor identification should use an authenticated Convex client",
);
assert.match(
  cloudBusinessAnalyticsGateway,
  /businessAnalytics:identifyBusinessVisitor/,
  "business visitor client should call the dedicated identification mutation",
);
assert.match(
  webApp,
  /identifyCloudBusinessVisitor\(\{ session \}\)/,
  "app session lifecycle should identify the current business visitor",
);
assert.doesNotMatch(
  businessAnalytics,
  /rawUrl|fullUrl|queryString|searchParams|referrer|userAgent|ipAddress/i,
  "business visit ingestion must not accept content-level analytics fields",
);
assert.match(
  webLandingPage,
  /recordCloudBusinessPageVisit\(\{[\s\S]*pathKind: "home"/,
  "landing page should record first-party home visits",
);
assert.match(
  cloudPublicFunnelGateway,
  /recordCloudBusinessPageVisit\(\{[\s\S]*pathKind: "community_funnel"/,
  "public community funnels should record first-party business visits",
);
assert.match(
  publicFunnelVisitMutation,
  /visitorKeyHash = await hashBusinessVisitorKey\(visitorKey\)/,
  "community funnel analytics should hash visitor keys before storage",
);
assert.doesNotMatch(
  publicFunnelVisitMutation,
  /authSubject|by_authSubject|\buserId\b/,
  "public funnel analytics must not accept or resolve user identity",
);
assert.match(
  communityAnalyticsEventSchema,
  /visitorKeyHash: v\.string\(\)/,
  "community funnel analytics should require a hashed visitor key",
);
assert.doesNotMatch(
  communityAnalyticsEventSchema,
  /visitorKey:|userId:|by_community_visitor_event/,
  "community funnel analytics schema should not retain raw keys or user identity",
);
assert.match(
  communityAnalyticsEventSchema,
  /by_community_visitor_hash_event[\s\S]*"createdAt"/,
  "community funnel analytics deduplication index should include time",
);
assert.match(
  publicFunnelVisitMutation,
  /withIndex\("by_community_visitor_hash_event"[\s\S]*\.gte\("createdAt", dedupeAfterMs\)[\s\S]*\.first\(\)/,
  "community funnel analytics should use a bounded recent-row lookup",
);
assert.doesNotMatch(
  publicFunnelVisitMutation,
  /\.collect\(\)/,
  "community funnel analytics must not scan all historical visits for a visitor",
);
assert.match(
  publicFunnelAnalyticsInsert,
  /visitorKeyHash,/,
  "community funnel analytics should write the hashed visitor key",
);
assert.doesNotMatch(
  publicFunnelAnalyticsInsert,
  /visitorKey\s*,|userId/,
  "community funnel analytics should not write raw visitor keys or user identity",
);
assert.match(
  cloudPublicFunnelGateway,
  /if \(visitorKey\) \{[\s\S]*visitorKey,[\s\S]*\}/,
  "public funnel client should skip analytics when a visitor key is unavailable",
);
assert.match(
  operatorTypes,
  /source: "first_party" \| "posthog" \| "vercel_analytics" \| "unavailable"/,
  "operator visitor source contract should include first-party analytics",
);
assert.match(
  monetizationQuery,
  /ctx\.db\s*\.query\("platformBusinessVisits" as any\)/,
  "operator business KPIs should read first-party business visits",
);
assert.match(
  monetizationQuery,
  /const uniqueVisitorHashes = new Set\([\s\S]*businessVisitRows[\s\S]*visitorKeyHash/,
  "operator business KPIs should count deduped visitor hashes",
);
assert.match(
  monetizationQuery,
  /const identifiedVisitorHashes = new Set\([\s\S]*businessVisitRows[\s\S]*row\.userId[\s\S]*visitorKeyHash/,
  "operator business KPIs should count identified visitor hashes",
);
assert.match(
  operatorTypes,
  /identified: number/,
  "operator visitor KPI contract should expose identified visitor count",
);
assert.match(
  monetizationQuery,
  /visitorToUserConversionRate: conversionRate\(identifiedVisitorCount, uniqueVisitorCount\)/,
  "operator visitor-to-user conversion should use identified visitors, not all new users",
);
assert.doesNotMatch(
  monetizationQuery,
  /visitorToUserConversionRate: conversionRate\(newUsers\.length, uniqueVisitorCount\)/,
  "operator visitor-to-user conversion must not divide all new users by tracked visitors",
);
assert.match(
  monetizationQuery,
  /source: "first_party"/,
  "operator visitor KPIs should report the first-party source",
);
assert.doesNotMatch(
  monetizationQuery,
  /accountSetupCompleted|accountSetupCompletionRate|userProfileDetails|userProviderConnections|userMemorySettings/,
  "operator monetization must not duplicate account setup derivation",
);
assert.match(
  monetizationQuery,
  /String\(membership\.userId\) === String\(community\.ownerId\)/,
  "operator community creator activation must exclude owner self-membership",
);
assert.match(
  monetizationQuery,
  /ctx\.db\.query\("communityMemberships"\)\.collect\(\)/,
  "operator business activation should be derived from community memberships",
);
assert.match(
  monetizationQuery,
  /const totalCompletions = inRangeCheckouts\.filter\(\(row: any\) => row\.status === "complete"\)\.length/,
  "operator checkout completions should use the selected business window",
);
assert.match(
  monetizationQuery,
  /totalConversionRate: conversionRate\(totalCompletions, inRangeCheckouts\.length\)/,
  "operator checkout conversion should use starts and completions from the same window",
);
assert.match(
  monetizationQuery,
  /const grossRevenueInRange = addMoney\(communityCheckoutRevenueInRange, creditTopupRevenueInRange\)/,
  "operator gross revenue should combine community checkout and credit top-up revenue",
);
assert.match(
  monetizationQuery,
  /communityPlatformRevShareInRange[\s\S]*applyBpsToMoneyMetric\(moneyFromCheckout\(row\), platformFeeBps\)/,
  "operator community rev-share should be estimated from completed community checkout rows",
);
assert.match(
  operatorIntelligence,
  /platformNetRevenueAvailability: "not_instrumented"/,
  "operator platform net revenue must not be fabricated before fee attribution exists",
);
assert.doesNotMatch(
  operatorIntelligence,
  new RegExp("buil" + "derPlanCheckoutStarts|buil" + "derPlanCheckoutCompletions"),
  "operator monetization must not expose deprecated paid-plan checkout metrics",
);

assert.match(
  operatorTypes,
  /activeMemberships: number/,
  "operator member contract must name membership counts honestly",
);
assert.match(
  operatorTypes,
  /averageMembersPerCommunity: number \| null/,
  "operator community overview should expose average members per community",
);
assert.match(
  operatorTypes,
  /paidCommunityConversionRate: number \| null/,
  "operator community overview should expose paid community conversion",
);
assert.match(
  operatorTypes,
  /setupRiskCommunities: number/,
  "operator community overview should expose setup-risk community count",
);
assert.match(
  operatorTypes,
  /averageMrrPerCommunity: OperatorMoneyMetric \| null/,
  "operator community overview should expose average community MRR",
);

assert.doesNotMatch(
  operatorTypes,
  /activeMembers: number/,
  "operator member contract must not expose activeMembers until it is usage-window based",
);

assert.match(
  operatorIntelligence,
  /ctx\.db\.query\("communities"\)\.collect\(\)/,
  "operator community creator search must filter before applying the limit",
);

assert.doesNotMatch(
  operatorIntelligence,
  /query\("criticalAuditEvents"\)\.order\("desc"\)\.take\(100\)/,
  "operator overview critical event counts must not be capped at 100",
);
assert.match(
  operatorIntelligence,
  /COMMUNITY_SETUP_RISK_FLAGS/,
  "operator community risk rollup should use an explicit setup-risk flag set",
);
assert.match(
  operatorIntelligence,
  /STALE_COMMUNITY_ACTIVITY_AGE_MS/,
  "operator community overview should identify stale community activity",
);
assert.match(
  operatorIntelligence,
  /averageMrrPerCommunity: divideMoney\(estimatedMrr, communities\.length\)/,
  "operator community overview should derive average MRR from total MRR",
);

assert.doesNotMatch(
  operatorIntelligence,
  /query\("communities"\)\.order\("desc"\)\.take\(limit\)/,
  "operator risk scans must not hide older communities before filtering",
);

console.log("operator_intelligence_proof: ok");
