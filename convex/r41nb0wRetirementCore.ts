import { EXISTING_FOUNDER_INFERENCE_COHORT_KEY } from "../shared/founderInference";

export const R41NB0W_RETIREMENT_POLICY_VERSION = "r41nb0w_retirement:v1" as const;
export const R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE = 500;

export type R41nb0wRetirementTarget = {
  ownerUserId: any;
  communityId: any;
  founderGrantId: any;
  openAiConnectionId: any;
  communitySlug: string;
  communityName: string;
};

type CommunityTableDefinition = {
  table: string;
  index: string;
};

/* Product state owned by the retired community. Cognition-derived state is
   deliberately handled by communityCognitionCleanup after the canonical row
   is gone. Financial, audit, DM, runtime, and user-owned state is excluded. */
export const R41NB0W_DIRECT_PRODUCT_TABLES: readonly CommunityTableDefinition[] = [
  { table: "communityOnboardingConfigs", index: "by_community" },
  { table: "communityPresence", index: "by_community_lastSeenAt" },
  { table: "communityBlocks", index: "by_community" },
  { table: "communityFunnels", index: "by_community" },
  { table: "communityAnalyticsEvents", index: "by_community_createdAt" },
  { table: "communityActivityEvents", index: "by_community_createdAt" },
  { table: "communityFeaturedMessages", index: "by_community_createdAt" },
  { table: "communityTypingPresence", index: "by_community" },
  { table: "communityInteractionContentBlocks", index: "by_community_createdAt" },
  { table: "communityInteractionMentions", index: "by_community_createdAt" },
  { table: "communityMentionBroadcasts", index: "by_community_role_emailMode_createdAt" },
  { table: "communityAgentServeRequests", index: "by_community_createdAt" },
  { table: "communityInteractionReactions", index: "by_community_createdAt" },
  { table: "communityInteractionModerationEvents", index: "by_community_createdAt" },
  { table: "communityInteractionLegacyChatLinks", index: "by_community_createdAt" },
  { table: "communityInteractionAttachments", index: "by_community_createdAt" },
  { table: "communityInteractionEmbeds", index: "by_community_status_createdAt" },
  { table: "communityInteractionReplies", index: "by_community_createdAt" },
  { table: "communityInteractionRoots", index: "by_community_createdAt" },
  { table: "communityAgentConfigs", index: "by_community" },
  { table: "communityAppMounts", index: "by_community" },
  { table: "communitySkillAttachments", index: "by_community" },
  { table: "communityAiFeedReactions", index: "by_community" },
  { table: "communityAiFeedPosts", index: "by_community" },
  { table: "communityMemberSettings", index: "by_community" },
  { table: "communityReadCursors", index: "by_community" },
  { table: "communityResourceContents", index: "by_community_resource" },
  { table: "communitySourceUnitContents", index: "by_community_source_unit" },
  { table: "communitySourceUnits", index: "by_community_crawl_job" },
  { table: "communitySourceCrawlJobs", index: "by_community_createdAt" },
  { table: "communityResourceBuilderChangesets", index: "by_community_createdAt" },
  { table: "communityResources", index: "by_community" },
  { table: "communityResourceModules", index: "by_community" },
  { table: "communityEvents", index: "by_community" },
] as const;

/* These community-scoped rows lack a community-first index. They are bounded
   scans because this is a fixed one-off retirement, not a public lifecycle. */
export const R41NB0W_SCANNED_PRODUCT_TABLES = [
  "communityOnboardingSessions",
  "userSourceIntegrationAuthStates",
  "memberFacts",
  "appOAuthStates",
  "userPlatformAppMountSources",
] as const;

const ZERO_GUARD_TABLES: readonly CommunityTableDefinition[] = [
  { table: "communityMemberships", index: "by_community" },
  { table: "communityJoinRequests", index: "by_community" },
  { table: "communitySubscriptions", index: "by_community_user" },
  { table: "communityInferencePolicies", index: "by_community" },
  { table: "communityInferenceReceipts", index: "by_community_createdAt" },
  { table: "polynetCanonicalOperationReceipts", index: "by_scope_key" },
] as const;

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function assertBoundedRows(table: string, rows: Array<Record<string, any>>): void {
  if (rows.length > R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE) {
    throw new Error(`r41nb0w_retirement_table_limit_exceeded:${table}`);
  }
}

async function readCommunityRows(
  db: any,
  definition: CommunityTableDefinition,
  communityId: any,
): Promise<Array<Record<string, any>>> {
  const rows = await db
    .query(definition.table)
    .withIndex(definition.index, (query: any) => query.eq("communityId", communityId))
    .take(R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE + 1);
  assertBoundedRows(definition.table, rows);
  for (const row of rows) {
    if (normalizeId(row.communityId) !== normalizeId(communityId)) {
      throw new Error(`r41nb0w_retirement_row_scope_mismatch:${definition.table}`);
    }
  }
  return rows;
}

async function readScannedCommunityRows(
  db: any,
  table: string,
  communityId: any,
): Promise<Array<Record<string, any>>> {
  const rows = await db
    .query(table)
    .filter((query: any) => query.eq(query.field("communityId"), communityId))
    .take(R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE + 1);
  assertBoundedRows(table, rows);
  for (const row of rows) {
    if (normalizeId(row.communityId) !== normalizeId(communityId)) {
      throw new Error(`r41nb0w_retirement_row_scope_mismatch:${table}`);
    }
  }
  return rows;
}

async function countByIndex(args: {
  db: any;
  table: string;
  index: string;
  field: string;
  value: any;
}): Promise<number> {
  const rows = await args.db
    .query(args.table)
    .withIndex(args.index, (query: any) => query.eq(args.field, args.value))
    .take(R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE + 1);
  assertBoundedRows(args.table, rows);
  return rows.length;
}

async function assertStorageObjectsAreCommunityExclusive(args: {
  db: any;
  communityId: any;
  storageIds: any[];
}): Promise<void> {
  for (const storageId of args.storageIds) {
    const [communities, modules, profiles, interactionAttachments, cloudAttachments, tickets] =
      await Promise.all([
        args.db
          .query("communities")
          .filter((query: any) =>
            query.or(
              query.eq(query.field("avatarStorageId"), storageId),
              query.eq(query.field("bannerStorageId"), storageId),
            ),
          )
          .take(2),
        args.db
          .query("communityResourceModules")
          .filter((query: any) => query.eq(query.field("bannerStorageId"), storageId))
          .take(2),
        args.db
          .query("userProfileDetails")
          .filter((query: any) => query.eq(query.field("avatarStorageId"), storageId))
          .take(1),
        args.db
          .query("communityInteractionAttachments")
          .withIndex("by_storage", (query: any) => query.eq("storageId", storageId))
          .take(2),
        args.db
          .query("cloudThreadAttachments")
          .withIndex("by_storage", (query: any) => query.eq("storageId", storageId))
          .take(1),
        args.db
          .query("cloudThreadAttachmentUploadTickets")
          .filter((query: any) => query.eq(query.field("claimedStorageId"), storageId))
          .take(1),
      ]);
    const hasForeignCommunityRef = communities.some(
      (row: any) => normalizeId(row._id) !== normalizeId(args.communityId),
    );
    const hasForeignModuleRef = modules.some(
      (row: any) => normalizeId(row.communityId) !== normalizeId(args.communityId),
    );
    const hasForeignAttachmentRef = interactionAttachments.some(
      (row: any) => normalizeId(row.communityId) !== normalizeId(args.communityId),
    );
    if (
      hasForeignCommunityRef ||
      hasForeignModuleRef ||
      hasForeignAttachmentRef ||
      profiles.length > 0 ||
      cloudAttachments.length > 0 ||
      tickets.length > 0
    ) {
      throw new Error("r41nb0w_retirement_shared_storage_forbidden");
    }
  }
}

export async function inspectR41nb0wRetirementCore(args: {
  ctx: any;
  target: R41nb0wRetirementTarget;
}) {
  const { ctx, target } = args;
  const [owner, community, grant, openAiConnection, ownerCommunities] = await Promise.all([
    ctx.db.get(target.ownerUserId),
    ctx.db.get(target.communityId),
    ctx.db.get(target.founderGrantId),
    ctx.db.get(target.openAiConnectionId),
    ctx.db
      .query("communities")
      .withIndex("by_owner", (query: any) => query.eq("ownerId", target.ownerUserId))
      .take(3),
  ]);

  const directRows = new Map<string, Array<Record<string, any>>>();
  for (const definition of R41NB0W_DIRECT_PRODUCT_TABLES) {
    directRows.set(
      definition.table,
      await readCommunityRows(ctx.db, definition, target.communityId),
    );
  }
  const scannedRows = new Map<string, Array<Record<string, any>>>();
  for (const table of R41NB0W_SCANNED_PRODUCT_TABLES) {
    scannedRows.set(
      table,
      await readScannedCommunityRows(ctx.db, table, target.communityId),
    );
  }

  const chatThreads = await readCommunityRows(
    ctx.db,
    { table: "communityChatThreads", index: "by_community" },
    target.communityId,
  );
  const chatMessages: Array<Record<string, any>> = [];
  const chatReactions: Array<Record<string, any>> = [];
  for (const thread of chatThreads) {
    const messages = await ctx.db
      .query("communityChatMessages")
      .withIndex("by_thread", (query: any) => query.eq("threadId", thread._id))
      .take(R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE + 1);
    assertBoundedRows("communityChatMessages", messages);
    chatMessages.push(...messages);
    for (const message of messages) {
      const reactions = await ctx.db
        .query("communityMessageReactions")
        .withIndex("by_message", (query: any) => query.eq("messageId", message._id))
        .take(R41NB0W_RETIREMENT_MAX_ROWS_PER_TABLE + 1);
      assertBoundedRows("communityMessageReactions", reactions);
      chatReactions.push(...reactions);
    }
  }
  assertBoundedRows("communityChatMessages", chatMessages);
  assertBoundedRows("communityMessageReactions", chatReactions);

  const guardCounts: Record<string, number> = {};
  for (const definition of ZERO_GUARD_TABLES) {
    guardCounts[definition.table] = (
      await readCommunityRows(ctx.db, definition, target.communityId)
    ).length;
  }

  const [checkoutSessions, purchaseClaims, agentChannels] = await Promise.all([
    readCommunityRows(
      ctx.db,
      { table: "checkoutSessions", index: "by_community_status" },
      target.communityId,
    ),
    readCommunityRows(
      ctx.db,
      { table: "purchaseClaims", index: "by_community_status" },
      target.communityId,
    ),
    readCommunityRows(
      ctx.db,
      { table: "memberAgentChannels", index: "by_community" },
      target.communityId,
    ),
  ]);

  const storageIds = Array.from(
    new Map(
      [
        community?.avatarStorageId,
        community?.bannerStorageId,
        ...(directRows.get("communityResourceModules") ?? []).map(
          (row) => row.bannerStorageId,
        ),
        ...(directRows.get("communityInteractionAttachments") ?? []).map(
          (row) => row.storageId,
        ),
      ]
        .filter(Boolean)
        .map((id) => [normalizeId(id), id]),
    ).values(),
  );
  await assertStorageObjectsAreCommunityExclusive({
    db: ctx.db,
    communityId: target.communityId,
    storageIds,
  });

  const violations: string[] = [];
  if (!owner) violations.push("owner_missing");
  if (!community) violations.push("community_missing");
  if (community && normalizeId(community.ownerId) !== normalizeId(target.ownerUserId)) {
    violations.push("community_owner_mismatch");
  }
  if (community && String(community.slug ?? "") !== target.communitySlug) {
    violations.push("community_slug_mismatch");
  }
  if (community && String(community.name ?? "") !== target.communityName) {
    violations.push("community_name_mismatch");
  }
  if (
    ownerCommunities.length !== 1 ||
    normalizeId(ownerCommunities[0]?._id) !== normalizeId(target.communityId)
  ) {
    violations.push("owner_community_set_mismatch");
  }
  if (
    !grant ||
    normalizeId(grant.userId) !== normalizeId(target.ownerUserId) ||
    grant.cohortKey !== EXISTING_FOUNDER_INFERENCE_COHORT_KEY ||
    grant.status !== "approved" ||
    grant.activationAcceptanceId ||
    grant.activatedAt
  ) {
    violations.push("founder_grant_not_pristine_approved");
  }
  if (
    !openAiConnection ||
    normalizeId(openAiConnection.userId) !== normalizeId(target.ownerUserId) ||
    openAiConnection.provider !== "openai" ||
    openAiConnection.authKind !== "api_key"
  ) {
    violations.push("openai_connection_mismatch");
  }
  for (const [table, count] of Object.entries(guardCounts)) {
    if (count !== 0) violations.push(`${table}_not_empty`);
  }
  if (checkoutSessions.some((row) => row.status === "complete")) {
    violations.push("completed_checkout_present");
  }
  if (purchaseClaims.some((row) => row.status === "redeemed")) {
    violations.push("redeemed_purchase_claim_present");
  }
  if ((scannedRows.get("communityOnboardingSessions") ?? []).length > 0) {
    violations.push("community_onboarding_sessions_not_empty");
  }

  const productCounts: Record<string, number> = Object.fromEntries(
    [
      ...Array.from(directRows.entries()).map(([table, rows]) => [table, rows.length]),
      ...Array.from(scannedRows.entries()).map(([table, rows]) => [table, rows.length]),
      ["communityChatThreads", chatThreads.length],
      ["communityChatMessages", chatMessages.length],
      ["communityMessageReactions", chatReactions.length],
    ],
  ) as Record<string, number>;
  const productRowCount = Object.values(productCounts).reduce(
    (sum, count) => sum + Number(count),
    0,
  );

  const retainedCounts = {
    user: owner ? 1 : 0,
    auth_sessions: await countByIndex({
      db: ctx.db,
      table: "authSessions",
      index: "by_user",
      field: "userId",
      value: target.ownerUserId,
    }),
    stripe_connect_accounts: await countByIndex({
      db: ctx.db,
      table: "userStripeConnectAccounts",
      index: "by_user",
      field: "userId",
      value: target.ownerUserId,
    }),
    community_price_points: await countByIndex({
      db: ctx.db,
      table: "communityPricePoints",
      index: "by_community",
      field: "communityId",
      value: target.communityId,
    }),
    checkout_sessions: checkoutSessions.length,
    purchase_claims: purchaseClaims.length,
    critical_audit_events: await countByIndex({
      db: ctx.db,
      table: "criticalAuditEvents",
      index: "by_community_createdAt",
      field: "communityId",
      value: target.communityId,
    }),
    direct_messages_from_community: await countByIndex({
      db: ctx.db,
      table: "dmConversations",
      index: "by_createdFromCommunity",
      field: "createdFromCommunityId",
      value: target.communityId,
    }),
    developer_apps: await countByIndex({
      db: ctx.db,
      table: "developerApps",
      index: "by_owner",
      field: "ownerUserId",
      value: target.ownerUserId,
    }),
    agent_channels: agentChannels.length,
  };

  return {
    policy_version: R41NB0W_RETIREMENT_POLICY_VERSION,
    target: {
      owner_user_id: normalizeId(target.ownerUserId),
      community_id: normalizeId(target.communityId),
      founder_grant_id: normalizeId(target.founderGrantId),
      openai_connection_id: normalizeId(target.openAiConnectionId),
      community_slug: target.communitySlug,
    },
    ready: violations.length === 0,
    violations,
    state_facts: {
      owner_present: Boolean(owner),
      community_present: Boolean(community),
      founder_grant_present: Boolean(grant),
      openai_connection_present: Boolean(openAiConnection),
      owner_community_count: ownerCommunities.length,
    },
    product_counts: productCounts,
    product_row_count: productRowCount,
    storage_object_count: storageIds.length,
    retained_counts: retainedCounts,
    rows: {
      directRows,
      scannedRows,
      chatThreads,
      chatMessages,
      chatReactions,
      agentChannels,
      storageIds,
    },
  };
}

export function publicR41nb0wRetirementInspection(
  inspection: Awaited<ReturnType<typeof inspectR41nb0wRetirementCore>>,
) {
  const { rows: _rows, ...safe } = inspection;
  return safe;
}

export async function executeR41nb0wRetirementCore(args: {
  ctx: any;
  target: R41nb0wRetirementTarget;
  nowMs: number;
}) {
  const inspection = await inspectR41nb0wRetirementCore(args);
  if (!inspection.ready) {
    throw new Error(`r41nb0w_retirement_precondition_failed:${inspection.violations.join(",")}`);
  }

  const { rows } = inspection;
  for (const channel of rows.agentChannels) {
    await args.ctx.db.patch(channel._id, {
      communityId: undefined,
      communityNameSnapshot: args.target.communityName,
      communityDeletedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  for (const row of rows.chatReactions) await args.ctx.db.delete(row._id);
  for (const row of rows.chatMessages) await args.ctx.db.delete(row._id);
  for (const row of rows.chatThreads) await args.ctx.db.delete(row._id);
  for (const table of R41NB0W_SCANNED_PRODUCT_TABLES) {
    for (const row of rows.scannedRows.get(table) ?? []) await args.ctx.db.delete(row._id);
  }
  for (const definition of R41NB0W_DIRECT_PRODUCT_TABLES) {
    for (const row of rows.directRows.get(definition.table) ?? []) {
      await args.ctx.db.delete(row._id);
    }
  }
  await args.ctx.db.delete(args.target.openAiConnectionId);
  await args.ctx.db.delete(args.target.founderGrantId);
  await args.ctx.db.delete(args.target.communityId);
  for (const storageId of rows.storageIds) await args.ctx.storage.delete(storageId);

  return {
    policy_version: R41NB0W_RETIREMENT_POLICY_VERSION,
    community_id: normalizeId(args.target.communityId),
    owner_user_id: normalizeId(args.target.ownerUserId),
    deleted_product_row_count: inspection.product_row_count,
    deleted_canonical_control_row_count: 3,
    deleted_storage_object_count: rows.storageIds.length,
    detached_agent_channel_count: rows.agentChannels.length,
    retained_counts_before: inspection.retained_counts,
  };
}
