import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Role = "admin" | "moderator" | "member" | null;
type EntryPolicy = "open" | "approval" | "paid_subscription";
type SubscriptionStatus = "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended" | null;
type Relation = "pending" | "member" | "moderator" | "admin" | "owner" | null;

type AccessScenario = {
  name: string;
  isOwner?: boolean;
  role?: Role;
  membershipActive?: boolean;
  accessSource?: "" | "free_grant" | "manual_grant" | "paid_subscription";
  entryPolicy?: EntryPolicy;
  subscriptionStatus?: SubscriptionStatus;
  joinRequestStatus?: string | null;
  isBlocked?: boolean;
};

type AccessProjection = {
  relation: Relation;
  isEntitled: boolean;
  canEnterCommunity: boolean;
  canReadChat: boolean;
  canPostChat: boolean;
  canManageMembers: boolean;
  canManageResources: boolean;
  canReviewJoinRequests: boolean;
};

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function subscriptionGrantsAccess(status: SubscriptionStatus): boolean {
  return status === "active" || status === "past_due" || status === "cancel_at_period_end";
}

function accessSourceIsDurable(source: AccessScenario["accessSource"]): boolean {
  return source === "" || source === "free_grant" || source === "manual_grant";
}

function resolveScenarioAccess(scenario: AccessScenario): AccessProjection {
  const isOwner = scenario.isOwner === true;
  const role = scenario.role ?? null;
  const entryPolicy = scenario.entryPolicy ?? "open";
  const membershipActive = scenario.membershipActive !== false;
  const accessSource = scenario.accessSource ?? "";
  const subscriptionStatus = scenario.subscriptionStatus ?? null;

  const isEntitled = isOwner
    ? true
    : scenario.isBlocked
      ? false
      : !membershipActive
      ? false
      : entryPolicy !== "paid_subscription" || accessSourceIsDurable(accessSource)
        ? true
        : subscriptionGrantsAccess(subscriptionStatus);
  const isAdmin = !isOwner && isEntitled && role === "admin";
  const isModerator = !isOwner && isEntitled && role === "moderator";
  const relation: Relation = isOwner
    ? "owner"
    : isAdmin
      ? "admin"
      : isModerator
        ? "moderator"
        : isEntitled
          ? "member"
          : scenario.joinRequestStatus === "pending"
            ? "pending"
            : null;

  return {
    relation,
    isEntitled,
    canEnterCommunity: isEntitled,
    canReadChat: isEntitled,
    canPostChat: isEntitled,
    canManageMembers: isOwner || isAdmin,
    canManageResources: isOwner || isAdmin,
    canReviewJoinRequests: isOwner || isAdmin || isModerator,
  };
}

function assertScenario(
  scenario: AccessScenario,
  expected: Partial<AccessProjection>,
) {
  const actual = resolveScenarioAccess(scenario);
  assert.deepEqual(
    Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key as keyof AccessProjection]])),
    expected,
    scenario.name,
  );
}

function assertSourceAnchors() {
  const communityCore = readText(new URL("../convex/communityCore.ts", import.meta.url));
  const communityAdmin = readText(new URL("../convex/communityAdmin.ts", import.meta.url));
  const communityResources = readText(new URL("../convex/communityResources.ts", import.meta.url));
  const resourceViewer = readText(new URL("../apps/web/src/components/WebCommunityResourceViewerModal.tsx", import.meta.url));
  const linkEmbedUi = readText(new URL("../shared/linkEmbedUi.tsx", import.meta.url));

  assertIncludes(
    communityCore,
    "return status === \"active\" || status === \"past_due\" || status === \"cancel_at_period_end\";",
    "community subscription access policy",
  );
  assertIncludes(
    communityCore,
    "const isAdmin = !isOwner && isEntitled && role === \"admin\";",
    "admin powers depend on entitlement",
  );
  assertIncludes(
    communityCore,
    "const isModerator = !isOwner && isEntitled && role === \"moderator\";",
    "moderator powers depend on entitlement",
  );
  assertIncludes(
    communityCore,
    "const canManageMembers = isOperational && (isOwner || isAdmin);",
    "member management capability policy must also require operational lifecycle",
  );
  assertIncludes(
    communityCore,
    "const canManageResources = isOperational && (isOwner || isAdmin);",
    "resource management excludes moderators and archived communities",
  );
  assertIncludes(
    communityResources,
    "await requireCommunityChatAccess({",
    "resource listing uses community chat access",
  );
  assertIncludes(
    communityResources,
    "await requireCommunityManager({",
    "resource mutations require community manager",
  );
  assertIncludes(
    communityAdmin,
    "throw new Error(\"community_owner_role_fixed\");",
    "owner role cannot be edited",
  );
  assertIncludes(
    communityAdmin,
    "throw new Error(\"community_owner_remove_forbidden\");",
    "owner cannot be removed",
  );
  assertIncludes(
    communityAdmin,
    "resolveCommunityEntryPolicy(community) === \"paid_subscription\"",
    "join approval rejects paid communities",
  );
  assertIncludes(
    communityAdmin,
    "throw new Error(\"community_paid_checkout_required\");",
    "join approval uses paid checkout required domain error",
  );
  const blockGuardCalls = communityCore.match(/await requireCommunityUserNotBlocked\(\{/g) ?? [];
  assert.ok(
    blockGuardCalls.length >= 3,
    "expected chat, manager, and moderator gates to enforce active community blocks",
  );
  assertIncludes(
    communityCore,
    "url.protocol !== \"http:\" && url.protocol !== \"https:\"",
    "server URL normalization rejects unsafe schemes",
  );
  assertIncludes(
    communityCore,
    "throw new Error(\"community_url_invalid\");",
    "server URL normalization rejects invalid URLs",
  );
  assertIncludes(
    linkEmbedUi,
    "export function normalizeExternalUrl",
    "shared web URL normalizer is exported",
  );
  assertIncludes(
    linkEmbedUi,
    "url.protocol !== \"http:\" && url.protocol !== \"https:\"",
    "client URL normalization rejects unsafe schemes",
  );
  assertNotIncludes(
    resourceViewer,
    "?? resource.url",
    "resource viewer must not fall back to raw unsafe URLs",
  );
}

function main() {
  assertSourceAnchors();

  assertScenario(
    { name: "owner is entitled without membership", isOwner: true, membershipActive: false },
    {
      relation: "owner",
      isEntitled: true,
      canEnterCommunity: true,
      canManageMembers: true,
      canManageResources: true,
      canReviewJoinRequests: true,
    },
  );

  assertScenario(
    { name: "free active member can enter", role: "member", accessSource: "free_grant" },
    {
      relation: "member",
      isEntitled: true,
      canEnterCommunity: true,
      canManageMembers: false,
    },
  );

  assertScenario(
    {
      name: "blocked active member cannot enter",
      role: "member",
      accessSource: "free_grant",
      isBlocked: true,
    },
    {
      relation: null,
      isEntitled: false,
      canEnterCommunity: false,
      canReadChat: false,
      canPostChat: false,
    },
  );

  for (const status of ["active", "past_due", "cancel_at_period_end"] as const) {
    assertScenario(
      {
        name: `paid member with ${status} subscription can enter`,
        role: "member",
        accessSource: "paid_subscription",
        entryPolicy: "paid_subscription",
        subscriptionStatus: status,
      },
      {
        relation: "member",
        isEntitled: true,
        canEnterCommunity: true,
      },
    );
  }

  for (const status of ["canceled", "ended", null] as const) {
    assertScenario(
      {
        name: `paid member with ${status ?? "missing"} subscription cannot enter`,
        role: "member",
        accessSource: "paid_subscription",
        entryPolicy: "paid_subscription",
        subscriptionStatus: status,
      },
      {
        relation: null,
        isEntitled: false,
        canEnterCommunity: false,
        canReadChat: false,
        canPostChat: false,
      },
    );
  }

  assertScenario(
    {
      name: "active paid admin can manage members",
      role: "admin",
      accessSource: "paid_subscription",
      entryPolicy: "paid_subscription",
      subscriptionStatus: "active",
    },
    {
      relation: "admin",
      canManageMembers: true,
      canManageResources: true,
      canReviewJoinRequests: true,
    },
  );

  assertScenario(
    {
      name: "revoked admin loses admin powers",
      role: "admin",
      membershipActive: false,
      accessSource: "manual_grant",
    },
    {
      relation: null,
      isEntitled: false,
      canManageMembers: false,
      canManageResources: false,
      canReviewJoinRequests: false,
    },
  );

  assertScenario(
    {
      name: "blocked admin loses admin powers",
      role: "admin",
      accessSource: "manual_grant",
      isBlocked: true,
    },
    {
      relation: null,
      isEntitled: false,
      canManageMembers: false,
      canManageResources: false,
      canReviewJoinRequests: false,
    },
  );

  assertScenario(
    {
      name: "paid admin with canceled subscription loses admin powers",
      role: "admin",
      accessSource: "paid_subscription",
      entryPolicy: "paid_subscription",
      subscriptionStatus: "canceled",
    },
    {
      relation: null,
      isEntitled: false,
      canManageMembers: false,
      canManageResources: false,
      canReviewJoinRequests: false,
    },
  );

  assertScenario(
    { name: "moderator can review joins but cannot manage resources", role: "moderator", accessSource: "manual_grant" },
    {
      relation: "moderator",
      canReadChat: true,
      canManageMembers: false,
      canManageResources: false,
      canReviewJoinRequests: true,
    },
  );

  assertScenario(
    {
      name: "pending request is not entitled",
      role: null,
      membershipActive: false,
      joinRequestStatus: "pending",
    },
    {
      relation: "pending",
      isEntitled: false,
      canEnterCommunity: false,
    },
  );

  console.log("PASS: community access and role policy proof passed");
}

main();
