# Convex Schema Skeleton v1

Status: draft  
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`  
Goal: define a minimal Convex data shape that preserves current product contracts while reducing drift and duplication.

## 1) Design Rules

1. Keep facts immutable where possible (`messages`, `runtimeRunEvents`, billing/event ledgers).
2. Keep projections explicit (`runtimeRuns`, entitlement snapshots) and rebuildable.
3. One canonical source for gates (`userEntitlements` + community role membership).
4. Keep cloud project/thread/sandbox relationship explicit and indexed.
5. Canonical tier enum is `free | builder` (`architect` / `pro` normalize to `builder` during migration).

## 2) Suggested Convex Module Layout

1. `convex/schema.ts`
2. `convex/auth.ts`
3. `convex/entitlements.ts`
4. `convex/gates.ts`
5. `convex/communities.ts`
6. `convex/threads.ts`
7. `convex/projects.ts`
8. `convex/daytona.ts`
9. `convex/runtime.ts`
10. `convex/billing.ts`

## 3) Schema Skeleton (TypeScript)

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ---------- Identity ----------
  users: defineTable({
    authSubject: v.string(), // provider subject (google/clerk/etc)
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authSubject", ["authSubject"])
    .index("by_email", ["email"]),

  // ---------- Entitlements / Tier ----------
  userEntitlements: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("builder")),
    source: v.union(
      v.literal("default"),
      v.literal("stripe"),
      v.literal("admin_override"),
      v.literal("manual_grant"),
    ),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active_window", ["userId", "startsAt", "endsAt"]),

  // ---------- Community ----------
  communities: defineTable({
    ownerId: v.id("users"),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal("published"), v.literal("unlisted")),
    pricingMode: v.union(
      v.literal("free"),
      v.literal("monthly"),
      v.literal("annual"),
      v.literal("both"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"])
    .index("by_visibility", ["visibility"]),

  communityMembers: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    role: v.union(
      v.literal("member"),
      v.literal("mod"),
      v.literal("admin"),
      v.literal("owner"),
    ),
    status: v.union(v.literal("active"), v.literal("revoked"), v.literal("pending")),
    joinedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_user", ["userId"])
    .index("by_community_user", ["communityId", "userId"]),

  // Community-level entitlement grants (join/purchase)
  communityEntitlements: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    source: v.union(v.literal("public_join"), v.literal("checkout"), v.literal("manual_grant")),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

  // ---------- Cloud Projects ----------
  cloudProjects: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    slug: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_slug", ["ownerId", "slug"])
    .index("by_owner_status", ["ownerId", "status"]),

  // ---------- Threads / Messages ----------
  threads: defineTable({
    ownerId: v.id("users"),
    context: v.union(v.literal("cloud"), v.literal("local"), v.literal("community")),
    title: v.optional(v.string()),
    titleSource: v.union(v.literal("auto"), v.literal("manual")),
    communityId: v.optional(v.id("communities")),
    projectId: v.optional(v.id("cloudProjects")), // required for cloud context in app logic
    modelId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .index("by_owner_context", ["ownerId", "context"])
    .index("by_project", ["projectId"])
    .index("by_community", ["communityId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    text: v.string(),
    modelId: v.optional(v.string()),
    providerLabel: v.optional(v.string()),
    inferenceLane: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_createdAt", ["threadId", "createdAt"]),

  // ---------- Daytona ----------
  daytonaSandboxes: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    provider: v.literal("daytona"),
    providerSandboxId: v.string(),
    toolboxProxyUrl: v.string(),
    status: v.union(
      v.literal("not_started"),
      v.literal("starting"),
      v.literal("running"),
      v.literal("stopping"),
      v.literal("stopped"),
      v.literal("error"),
    ),
    region: v.optional(v.string()),
    lastStatusAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_project", ["ownerId", "projectId"])
    .index("by_providerSandboxId", ["providerSandboxId"]),

  // ---------- Runtime ----------
  runtimeRuns: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    projectId: v.optional(v.id("cloudProjects")),
    communityId: v.optional(v.id("communities")),
    lane: v.union(
      v.literal("public"),
      v.literal("platform"),
      v.literal("chatgpt"),
      v.literal("daytona"),
      v.literal("local"),
    ),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("error"), v.literal("cancelled")),
    modelId: v.string(),
    engineId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_thread", ["threadId"])
    .index("by_project", ["projectId"])
    .index("by_owner_startedAt", ["ownerId", "startedAt"]),

  runtimeRunEvents: defineTable({
    runId: v.id("runtimeRuns"),
    seq: v.number(),
    eventType: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_run_seq", ["runId", "seq"])
    .index("by_createdAt", ["createdAt"]),

  // ---------- Billing ----------
  billingCustomers: defineTable({
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]).index("by_customer", ["stripeCustomerId"]),

  billingSubscriptions: defineTable({
    userId: v.id("users"),
    provider: v.literal("stripe"),
    providerSubscriptionId: v.string(),
    status: v.string(),
    tier: v.union(v.literal("free"), v.literal("builder")),
    currentPeriodEnd: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_provider_sub", ["providerSubscriptionId"]),

  billingEvents: defineTable({
    provider: v.literal("stripe"),
    providerEventId: v.string(),
    type: v.string(),
    payload: v.any(),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_provider_event", ["providerEventId"])
    .index("by_createdAt", ["createdAt"]),
});
```

## 4) Gate Inputs in Convex (Single Resolver Target)

All gate decisions should read from:

1. `users`
2. `userEntitlements` (active tier window)
3. `communityMembers`
4. `communityEntitlements`
5. `threads` + `cloudProjects` (for context and project ownership)

No gate should require ad-hoc reads outside this set.

## 5) Required Convex Functions (v1)

1. `queries/gates.resolveGateContext`
2. `queries/gates.canUseModel`
3. `queries/gates.canRunTools`
4. `queries/gates.canAccessCommunityTab`
5. `mutations/projects.createCloudProject`
6. `mutations/projects.renameCloudProject`
7. `mutations/projects.archiveCloudProject`
8. `mutations/threads.createThread` (auto-bind `General` project for cloud context)
9. `mutations/runtime.startRun`
10. `mutations/runtime.appendRunEvent`
11. `mutations/runtime.finishRun`
12. `actions/daytona.executeTool` (network call to Daytona)

## 6) Migration Mapping (Legacy Cloud -> Convex)

| Legacy Cloud concept | Convex target |
|---|---|
| `profiles.builder_tier` | `userEntitlements` current active row |
| `entitlements` | `communityEntitlements` |
| `community_memberships` | `communityMembers` |
| `threads` | `threads` |
| `messages` | `messages` |
| `daytona_cloud_projects` | `cloudProjects` |
| `daytona_sandboxes` | `daytonaSandboxes` |
| `runtime_runs` | `runtimeRuns` |
| `runtime_run_events` | `runtimeRunEvents` |
| Stripe webhook projection | `billing*` tables + entitlement update mutation |

## 7) Cutover Order (minimal risk)

1. Implement schema and read-only parity queries.
2. Implement gate resolvers and compare against current Legacy Cloud outputs.
3. Switch thread/project reads to Convex.
4. Switch runtime run/event writes to Convex.
5. Switch entitlement reads/writes to Convex.
6. Remove Legacy Cloud runtime/gate dependencies.

## 8) Explicit Non-Goals for v1

1. Rebuilding all community analytics in Convex.
2. Replacing Daytona control plane behavior.
3. Reworking pricing model semantics beyond current tiers.
4. UI redesign unrelated to project/thread/sandbox management.

## 9) Tier Compatibility Adapter (Required During Migration)

Use this normalization at all migration and API boundaries:

```ts
function normalizeTier(raw: string | null | undefined): "free" | "builder" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "builder") return "builder";
  if (value === "architect" || value === "pro") return "builder"; // legacy aliases
  return "free";
}
```
