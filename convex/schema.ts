import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    authSubject: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authSubject", ["authSubject"])
    .index("by_email", ["email"]),

  userEntitlements: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("builder"), v.literal("architect")),
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
    .index("by_user_startsAt", ["userId", "startsAt"]),

  checkoutSessions: defineTable({
    sessionId: v.string(),
    mode: v.union(v.literal("community_join"), v.literal("builder_upgrade")),
    communityId: v.optional(v.id("communities")),
    billingPeriod: v.optional(v.string()),
    pricePointId: v.optional(v.id("communityPricePoints")),
    amountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    targetTier: v.optional(v.union(v.literal("builder"), v.literal("architect"))),
    ownerUserId: v.optional(v.id("users")),
    claimToken: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("complete"), v.literal("expired")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_status", ["ownerUserId", "status"]),

  purchaseClaims: defineTable({
    claimToken: v.string(),
    communityId: v.id("communities"),
    billingPeriod: v.optional(v.string()),
    pricePointId: v.optional(v.id("communityPricePoints")),
    amountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    ownerUserId: v.optional(v.id("users")),
    status: v.union(v.literal("pending"), v.literal("redeemed"), v.literal("expired")),
    sourceSessionId: v.optional(v.string()),
    redeemedByUserId: v.optional(v.id("users")),
    redeemedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_claimToken", ["claimToken"])
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_status", ["ownerUserId", "status"])
    .index("by_community_status", ["communityId", "status"]),

  userMemorySettings: defineTable({
    userId: v.id("users"),
    memoryMode: v.union(v.literal("off"), v.literal("suggest"), v.literal("auto")),
    rememberIntentEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  userProviderConnections: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("openrouter"), v.literal("chatgpt")),
    authKind: v.union(v.literal("api_key"), v.literal("oauth_tokens")),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    keyLastFour: v.optional(v.string()),
    keyFingerprint: v.optional(v.string()),
    accountId: v.optional(v.string()),
    email: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    validatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  userProviderAuthStates: defineTable({
    userId: v.id("users"),
    provider: v.literal("chatgpt"),
    state: v.string(),
    codeVerifier: v.string(),
    returnToPath: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_user_provider", ["userId", "provider"]),

  userProviderDeviceAuthStates: defineTable({
    userId: v.id("users"),
    provider: v.literal("chatgpt"),
    deviceAuthId: v.string(),
    userCode: v.string(),
    verificationUrl: v.string(),
    pollIntervalSeconds: v.number(),
    returnToPath: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_device_auth_id", ["deviceAuthId"]),

  userProfileDetails: defineTable({
    userId: v.id("users"),
    bio: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  personalMemoryItems: defineTable({
    userId: v.id("users"),
    content: v.string(),
    scope: v.union(v.literal("global"), v.literal("workspace")),
    scopeId: v.optional(v.string()),
    pinned: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_scope", ["userId", "scope"])
    .index("by_user_scope_updatedAt", ["userId", "scope", "updatedAt"]),

  cloudProjects: defineTable({
    ownerId: v.id("users"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    providerSandboxId: v.optional(v.string()),
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
    providerVolumeId: v.optional(v.string()),
    providerVolumeName: v.optional(v.string()),
    providerVolumeState: v.optional(v.string()),
    providerVolumeLastSeenAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"]),

  communities: defineTable({
    ownerId: v.id("users"),
    slug: v.string(),
    name: v.string(),
    oneLiner: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    bannerUrl: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    visibility: v.union(v.literal("published"), v.literal("unlisted")),
    entryPolicy: v.union(
      v.literal("open"),
      v.literal("approval"),
      v.literal("paid_subscription"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"])
    .index("by_visibility_updatedAt", ["visibility", "updatedAt"]),

  communityMemberships: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("member")),
    accessSource: v.optional(
      v.union(
        v.literal("free_grant"),
        v.literal("manual_grant"),
        v.literal("paid_subscription"),
      ),
    ),
    pricePointId: v.optional(v.id("communityPricePoints")),
    active: v.optional(v.boolean()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

  communityPresence: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_lastSeenAt", ["communityId", "lastSeenAt"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_user", ["userId"]),

  communityJoinRequests: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    status: v.string(),
    message: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

  communityFunnels: defineTable({
    communityId: v.id("communities"),
    heroMediaUrl: v.optional(v.string()),
    heroMediaKind: v.optional(v.union(v.literal("image"), v.literal("video"))),
    about: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityPricePoints: defineTable({
    communityId: v.id("communities"),
    billingPeriod: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    amountBaseUnits: v.number(),
    currency: v.string(),
    currencyDecimals: v.number(),
    isCurrent: v.boolean(),
    archivedAt: v.optional(v.number()),
    providerPriceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_billingPeriod", ["communityId", "billingPeriod"])
    .index("by_community_current", ["communityId", "isCurrent"]),

  communitySubscriptions: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    membershipId: v.id("communityMemberships"),
    pricePointId: v.id("communityPricePoints"),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancel_at_period_end"),
      v.literal("canceled"),
      v.literal("ended"),
    ),
    providerSubscriptionId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    currentPeriodStartAt: v.optional(v.number()),
    currentPeriodEndAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_membership", ["membershipId"])
    .index("by_pricePoint", ["pricePointId"])
    .index("by_community_user", ["communityId", "userId"]),

  communityChatThreads: defineTable({
    communityId: v.id("communities"),
    lastSeq: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityChatMessages: defineTable({
    threadId: v.id("communityChatThreads"),
    seq: v.number(),
    role: v.literal("user"),
    contentJson: v.any(),
    senderUserId: v.optional(v.id("users")),
    replyToMessageId: v.optional(v.id("communityChatMessages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_seq", ["threadId", "seq"])
    .index("by_sender", ["senderUserId"]),

  communityMessageReactions: defineTable({
    messageId: v.id("communityChatMessages"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"])
    .index("by_user", ["userId"]),

  communityAgentConfigs: defineTable({
    communityId: v.id("communities"),
    landingJson: v.optional(v.any()),
    systemPrompt: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityAiFeedPosts: defineTable({
    communityId: v.id("communities"),
    authorType: v.union(v.literal("agent"), v.literal("human")),
    authorUserId: v.optional(v.id("users")),
    agentKey: v.optional(v.string()),
    authorLabel: v.string(),
    type: v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    title: v.optional(v.string()),
    body: v.string(),
    whyNow: v.optional(v.string()),
    evidence: v.optional(v.array(v.string())),
    status: v.union(v.literal("live"), v.literal("hidden")),
    score: v.number(),
    goodCount: v.number(),
    lowSignalCount: v.number(),
    noveltyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    hiddenAt: v.optional(v.number()),
  })
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_status_score", ["communityId", "status", "score"])
    .index("by_community_noveltyKey", ["communityId", "noveltyKey"]),

  communityAiFeedReactions: defineTable({
    communityId: v.id("communities"),
    postId: v.id("communityAiFeedPosts"),
    actorType: v.union(v.literal("human"), v.literal("agent")),
    actorKey: v.string(),
    actorUserId: v.optional(v.id("users")),
    agentKey: v.optional(v.string()),
    reactionType: v.union(v.literal("good"), v.literal("low_signal")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_post_actorKey", ["postId", "actorKey"])
    .index("by_community", ["communityId"])
    .index("by_actorKey", ["actorKey"]),

  communityMemberSettings: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    muted: v.boolean(),
    mutedUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

  communityResources: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
    type: v.string(),
    title: v.string(),
    bodyMd: v.optional(v.string()),
    url: v.optional(v.string()),
    fileKey: v.optional(v.string()),
    pinned: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_createdBy", ["createdByUserId"]),

  threads: defineTable({
    ownerId: v.id("users"),
    threadKey: v.optional(v.string()),
    title: v.optional(v.string()),
    titleSource: v.union(v.literal("auto"), v.literal("manual")),
    projectId: v.optional(v.id("cloudProjects")),
    communityId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    contextVersion: v.optional(v.number()),
    // Legacy coding-era continuity kept temporarily so the reduced runtime can deploy
    // against existing rows while we finish migrating old thread documents.
    codingHandoff: v.optional(v.any()),
    workingState: v.optional(
      v.object({
        goal: v.optional(v.string()),
        lastResult: v.optional(v.string()),
        filesChanged: v.array(v.string()),
        verifiedFindings: v.array(v.string()),
        openIssue: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
    lastSeq: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updatedAt", ["ownerId", "updatedAt"])
    .index("by_owner_threadKey", ["ownerId", "threadKey"])
    .index("by_project", ["projectId"]),

  cloudMessages: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    messageKey: v.string(),
    seq: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    contentJson: v.any(),
    engineId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    runId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_seq", ["threadId", "seq"])
    .index("by_owner_messageKey", ["ownerId", "messageKey"]),

  runtimeRuns: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    lane: v.string(),
    requestedExecutionTarget: v.optional(v.union(v.literal("chat"), v.literal("daytona_workspace"))),
    requiresWorkspaceTools: v.optional(v.boolean()),
    projectId: v.optional(v.id("cloudProjects")),
    modelId: v.optional(v.string()),
    engineId: v.optional(v.string()),
    executionMode: v.optional(v.string()),
    sandboxMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("error"), v.literal("cancelled")),
    reason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastEventSeq: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_runId", ["ownerId", "runId"])
    .index("by_thread_status_startedAt", ["threadId", "status", "startedAt"])
    .index("by_thread_startedAt", ["threadId", "startedAt"])
    .index("by_owner_startedAt", ["ownerId", "startedAt"]),

  runtimeRunEvents: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    seq: v.number(),
    eventType: v.string(),
    eventKey: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_owner_run_seq", ["ownerId", "runId", "seq"])
    .index("by_thread_run_seq", ["threadId", "runId", "seq"])
    .index("by_owner_run_eventKey", ["ownerId", "runId", "eventKey"]),

});
