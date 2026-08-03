import { paginationOptsValidator } from "convex/server";
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChannelLike,
  channelHasCanonicalGeneralSystemContract,
  GENERAL_CHANNEL_SLUG,
  GENERAL_CHANNEL_SYSTEM_ROLE,
  interactionIsChannelAddressable,
  listGeneralChannelProjectionRows,
  requireCommunityChannelLineage,
} from "./communityChannelCore";
import { normalizeIdValue } from "./communityCore";

const channelAuditPhaseValidator = v.union(
  v.literal("roots"),
  v.literal("replies"),
  v.literal("mentions"),
  v.literal("mention_broadcasts"),
  v.literal("read_cursors"),
  v.literal("typing_presence"),
);

export type CommunityChannelAuditPhase =
  | "roots"
  | "replies"
  | "mentions"
  | "mention_broadcasts"
  | "read_cursors"
  | "typing_presence";

const MAX_COMMUNITY_CHANNEL_AUDIT_BATCH_SIZE = 100;

function boundedPaginationOpts(args: {
  numItems: number;
  cursor: string | null;
}): { numItems: number; cursor: string | null; maximumRowsRead: number } {
  const requested = Number(args.numItems);
  const numItems =
    Number.isFinite(requested) && requested > 0
      ? Math.min(
          MAX_COMMUNITY_CHANNEL_AUDIT_BATCH_SIZE,
          Math.floor(requested),
        )
      : 50;
  return {
    cursor: args.cursor,
    numItems,
    maximumRowsRead: numItems,
  };
}

type GeneralChannelAuditState = {
  state:
    | "canonical"
    | "missing"
    | "duplicate_system_role"
    | "slug_collision"
    | "invalid";
  channel: CommunityChannelLike | null;
  systemRoleRows: number;
  systemRoleRowsCapped: boolean;
  slugRows: number;
  slugRowsCapped: boolean;
};

async function inspectGeneralChannelAuditState(
  ctx: { db: any },
  communityId: any,
): Promise<GeneralChannelAuditState> {
  const [systemRoleRows, slugRows] = (await Promise.all([
    ctx.db
      .query("communityChannels" as any)
      .withIndex("by_community_systemRole", (q: any) =>
        q
          .eq("communityId", communityId)
          .eq("systemRole", GENERAL_CHANNEL_SYSTEM_ROLE),
      )
      .take(3),
    ctx.db
      .query("communityChannels" as any)
      .withIndex("by_community_slug", (q: any) =>
        q.eq("communityId", communityId).eq("slug", GENERAL_CHANNEL_SLUG),
      )
      .take(3),
  ])) as [CommunityChannelLike[], CommunityChannelLike[]];

  let state: GeneralChannelAuditState["state"];
  let channel: CommunityChannelLike | null = null;
  if (systemRoleRows.length === 0) {
    state = slugRows.length === 0 ? "missing" : "slug_collision";
  } else if (systemRoleRows.length > 1) {
    state = "duplicate_system_role";
  } else if (
    !channelHasCanonicalGeneralSystemContract(systemRoleRows[0]!, communityId)
  ) {
    state = "invalid";
  } else if (
    slugRows.length !== 1 ||
    normalizeIdValue(slugRows[0]?._id) !==
      normalizeIdValue(systemRoleRows[0]!._id)
  ) {
    state = "slug_collision";
  } else {
    state = "canonical";
    channel = systemRoleRows[0]!;
  }

  return {
    state,
    channel,
    systemRoleRows: systemRoleRows.length,
    systemRoleRowsCapped: systemRoleRows.length >= 3,
    slugRows: slugRows.length,
    slugRowsCapped: slugRows.length >= 3,
  };
}

type CommunityChannelAuditCounts = {
  scanned: number;
  alreadyCanonical: number;
  wouldUpdate: number;
  intentionallyUnchanneled: number;
  missingChannel: number;
  unexpectedChannel: number;
  invalid: number;
  projectionCollisionRows: number;
  phaseOrderBlocked: number;
  blockedByChannelState: number;
  evidenceSyncWouldSchedule: number;
};

function emptyAuditCounts(): CommunityChannelAuditCounts {
  return {
    scanned: 0,
    alreadyCanonical: 0,
    wouldUpdate: 0,
    intentionallyUnchanneled: 0,
    missingChannel: 0,
    unexpectedChannel: 0,
    invalid: 0,
    projectionCollisionRows: 0,
    phaseOrderBlocked: 0,
    blockedByChannelState: 0,
    evidenceSyncWouldSchedule: 0,
  };
}

function idsMatch(left: unknown, right: unknown): boolean {
  return Boolean(
    normalizeIdValue(left) &&
      normalizeIdValue(left) === normalizeIdValue(right),
  );
}

type SourceChannelResolution =
  | { state: "channel"; channelId: any }
  | { state: "intentionally_unchanneled" }
  | { state: "phase_order_blocked" }
  | { state: "invalid" };

async function resolveSourceChannel(args: {
  ctx: { db: any };
  communityId: any;
  row: { rootId?: any; replyId?: any };
}): Promise<SourceChannelResolution> {
  if (Boolean(args.row.rootId) === Boolean(args.row.replyId)) {
    return { state: "invalid" };
  }
  let root: any;
  if (args.row.replyId) {
    const reply = await args.ctx.db.get(args.row.replyId);
    if (
      !reply ||
      normalizeIdValue(reply.communityId) !== normalizeIdValue(args.communityId)
    ) {
      return { state: "invalid" };
    }
    root = await args.ctx.db.get(reply.rootId);
    if (
      !root ||
      normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId) ||
      (reply.channelId &&
        root.channelId &&
        !idsMatch(reply.channelId, root.channelId))
    ) {
      return { state: "invalid" };
    }
  } else {
    root = await args.ctx.db.get(args.row.rootId);
  }
  if (
    !root ||
    normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)
  ) {
    return { state: "invalid" };
  }
  if (!interactionIsChannelAddressable(root)) {
    return { state: "intentionally_unchanneled" };
  }
  if (!root.channelId) return { state: "phase_order_blocked" };
  try {
    const channel = await requireCommunityChannelLineage({
      ctx: args.ctx,
      communityId: args.communityId,
      channelId: root.channelId,
    });
    return { state: "channel", channelId: channel._id };
  } catch {
    return { state: "invalid" };
  }
}

function channelStateAllowsMigration(
  state: GeneralChannelAuditState["state"],
): boolean {
  return state === "canonical" || state === "missing";
}

export async function listGeneralChannelAuditCommunitiesCore(args: {
  ctx: { db: any };
  paginationOpts: { numItems: number; cursor: string | null };
}): Promise<Record<string, unknown>> {
  const paginationOpts = boundedPaginationOpts(args.paginationOpts);
  const batch = await args.ctx.db
    .query("communities" as any)
    .order("asc")
    .paginate(paginationOpts);
  return {
    ok: true,
    batch_limit: paginationOpts.numItems,
    scanned: batch.page.length,
    community_ids: batch.page.map((row: any) => normalizeIdValue(row._id)),
    complete: batch.isDone,
    continue_cursor: batch.continueCursor,
  };
}

export async function auditGeneralChannelMigrationBatchCore(args: {
  ctx: { db: any };
  communityId: any;
  phase: CommunityChannelAuditPhase;
  paginationOpts: { numItems: number; cursor: string | null };
}): Promise<Record<string, unknown>> {
  const community = await args.ctx.db.get(args.communityId);
  if (!community) throw new Error("community_not_found");
  const generalState = await inspectGeneralChannelAuditState(
    args.ctx,
    args.communityId,
  );
  const channelId = generalState.channel?._id ?? null;
  const migrationAllowed = channelStateAllowsMigration(generalState.state);
  const paginationOpts = boundedPaginationOpts(args.paginationOpts);
  const counts = emptyAuditCounts();

  const batch = await (
    args.phase === "roots" ||
    args.phase === "replies" ||
    args.phase === "mentions"
    ? args.ctx.db
        .query(
          args.phase === "roots"
            ? ("communityInteractionRoots" as any)
            : args.phase === "replies"
              ? ("communityInteractionReplies" as any)
              : ("communityInteractionMentions" as any),
        )
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId),
        )
        .order("asc")
    : args.phase === "mention_broadcasts"
      ? args.ctx.db
          .query("communityMentionBroadcasts" as any)
          .withIndex("by_community_createdAt", (q: any) =>
            q.eq("communityId", args.communityId),
          )
          .order("asc")
    : args.ctx.db
        .query(
          args.phase === "read_cursors"
            ? ("communityReadCursors" as any)
            : ("communityTypingPresence" as any),
        )
        .withIndex("by_community", (q: any) =>
          q.eq("communityId", args.communityId),
        )
        .order("asc"))
    .paginate(paginationOpts);

  for (const row of batch.page) {
    counts.scanned += 1;
    if (args.phase === "roots") {
      if (!interactionIsChannelAddressable(row)) {
        if (row.channelId) {
          counts.unexpectedChannel += 1;
          counts.invalid += 1;
        } else {
          counts.intentionallyUnchanneled += 1;
        }
        continue;
      }
      if (!row.channelId) {
        counts.missingChannel += 1;
        if (migrationAllowed) {
          counts.wouldUpdate += 1;
          counts.evidenceSyncWouldSchedule += 1;
        } else {
          counts.blockedByChannelState += 1;
        }
      } else {
        try {
          await requireCommunityChannelLineage({
            ctx: args.ctx,
            communityId: args.communityId,
            channelId: row.channelId,
          });
          counts.alreadyCanonical += 1;
        } catch {
          counts.unexpectedChannel += 1;
          counts.invalid += 1;
        }
      }
      continue;
    }

    if (args.phase === "replies") {
      const root = await args.ctx.db.get(row.rootId);
      if (
        !root ||
        normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)
      ) {
        counts.invalid += 1;
        continue;
      }
      if (!interactionIsChannelAddressable(root)) {
        if (row.channelId) {
          counts.unexpectedChannel += 1;
          counts.invalid += 1;
        } else {
          counts.intentionallyUnchanneled += 1;
        }
        continue;
      }
      let rootHasExpectedChannel = false;
      let expectedChannelId = root.channelId ?? channelId;
      if (root.channelId) {
        try {
          await requireCommunityChannelLineage({
            ctx: args.ctx,
            communityId: args.communityId,
            channelId: root.channelId,
          });
          rootHasExpectedChannel = true;
        } catch {
          counts.unexpectedChannel += 1;
          counts.invalid += 1;
          continue;
        }
      }
      if (!row.channelId) {
        counts.missingChannel += 1;
        if (migrationAllowed && expectedChannelId) {
          counts.wouldUpdate += 1;
          counts.evidenceSyncWouldSchedule += 1;
          if (!rootHasExpectedChannel) counts.phaseOrderBlocked += 1;
        } else {
          counts.blockedByChannelState += 1;
        }
      } else if (expectedChannelId && idsMatch(row.channelId, expectedChannelId)) {
        counts.alreadyCanonical += 1;
        if (!rootHasExpectedChannel) counts.phaseOrderBlocked += 1;
      } else {
        counts.unexpectedChannel += 1;
        counts.invalid += 1;
      }
      continue;
    }

    if (args.phase === "mentions" || args.phase === "mention_broadcasts") {
      const source = await resolveSourceChannel({
        ctx: args.ctx,
        communityId: args.communityId,
        row: {
          rootId:
            args.phase === "mention_broadcasts" ? row.sourceRootId : row.rootId,
          replyId:
            args.phase === "mention_broadcasts" ? row.sourceReplyId : row.replyId,
        },
      });
      if (source.state === "invalid") {
        counts.invalid += 1;
        continue;
      }
      if (source.state === "intentionally_unchanneled") {
        if (row.channelId) {
          counts.unexpectedChannel += 1;
          counts.invalid += 1;
        } else {
          counts.intentionallyUnchanneled += 1;
        }
        continue;
      }
      if (source.state === "phase_order_blocked") {
        counts.missingChannel += row.channelId ? 0 : 1;
        counts.phaseOrderBlocked += 1;
        continue;
      }
      if (!row.channelId) {
        counts.missingChannel += 1;
        if (args.phase === "mention_broadcasts") {
          const sourceMention = await args.ctx.db.get(row.sourceMentionId);
          if (!sourceMention || !idsMatch(sourceMention.channelId, source.channelId)) {
            counts.phaseOrderBlocked += 1;
            continue;
          }
        }
        counts.wouldUpdate += 1;
      } else if (idsMatch(row.channelId, source.channelId)) {
        counts.alreadyCanonical += 1;
      } else {
        counts.unexpectedChannel += 1;
        counts.invalid += 1;
      }
      continue;
    }

    if (row.channelId && (!channelId || !idsMatch(row.channelId, channelId))) {
      try {
        await requireCommunityChannelLineage({
          ctx: args.ctx,
          communityId: args.communityId,
          channelId: row.channelId,
        });
        counts.alreadyCanonical += 1;
      } catch {
        counts.unexpectedChannel += 1;
        counts.invalid += 1;
      }
      continue;
    }

    const projectionRows = await listGeneralChannelProjectionRows({
      ctx: args.ctx,
      tableName:
        args.phase === "read_cursors"
          ? "communityReadCursors"
          : "communityTypingPresence",
      communityId: args.communityId,
      generalChannelId: channelId,
      userId: row.userId,
      ...(args.phase === "read_cursors"
        ? { streamKind: row.streamKind }
        : {}),
    });
    if (projectionRows.length > 1) {
      counts.projectionCollisionRows += 1;
      const canonicalProjectionRows = channelId
        ? projectionRows.filter((candidate) =>
            idsMatch(candidate.channelId, channelId),
          )
        : [];
      if (
        row.channelId &&
        channelId &&
        idsMatch(row.channelId, channelId) &&
        canonicalProjectionRows.length === 1
      ) {
        counts.alreadyCanonical += 1;
      } else {
        counts.invalid += 1;
      }
      continue;
    }
    if (!row.channelId) {
      counts.missingChannel += 1;
      if (migrationAllowed) counts.wouldUpdate += 1;
      else counts.blockedByChannelState += 1;
    } else if (channelId && idsMatch(row.channelId, channelId)) {
      counts.alreadyCanonical += 1;
    } else {
      counts.unexpectedChannel += 1;
      counts.invalid += 1;
    }
  }

  const migrationBlocked =
    !migrationAllowed ||
    counts.invalid > 0 ||
    counts.projectionCollisionRows > 0 ||
    counts.phaseOrderBlocked > 0;
  return {
    ok: true,
    read_only: true,
    phase: args.phase,
    community_id: normalizeIdValue(args.communityId),
    general_channel_state: generalState.state,
    general_channel_id: channelId ? normalizeIdValue(channelId) : null,
    general_channel_display_name: generalState.channel?.name ?? null,
    general_channel_would_create: generalState.state === "missing",
    general_system_role_rows: generalState.systemRoleRows,
    general_system_role_rows_capped: generalState.systemRoleRowsCapped,
    general_slug_rows: generalState.slugRows,
    general_slug_rows_capped: generalState.slugRowsCapped,
    migration_blocked: migrationBlocked,
    batch_limit: paginationOpts.numItems,
    scanned: counts.scanned,
    already_canonical: counts.alreadyCanonical,
    would_update: counts.wouldUpdate,
    intentionally_unchanneled: counts.intentionallyUnchanneled,
    missing_channel: counts.missingChannel,
    unexpected_channel: counts.unexpectedChannel,
    invalid: counts.invalid,
    projection_collision_rows: counts.projectionCollisionRows,
    phase_order_blocked: counts.phaseOrderBlocked,
    blocked_by_channel_state: counts.blockedByChannelState,
    evidence_sync_would_schedule: counts.evidenceSyncWouldSchedule,
    complete: batch.isDone,
    continue_cursor: batch.continueCursor,
  };
}

export const listGeneralChannelAuditCommunitiesInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await listGeneralChannelAuditCommunitiesCore({
      ctx,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const auditGeneralChannelMigrationBatchInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    phase: channelAuditPhaseValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await auditGeneralChannelMigrationBatchCore({
      ctx,
      communityId: args.communityId,
      phase: args.phase,
      paginationOpts: args.paginationOpts,
    });
  },
});
