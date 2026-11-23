import { resolveNotificationRecipientSource } from "./communityNotificationAccess";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolvePublicUserId,
} from "./communityCore";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import { type ConciergeMentionRow } from "./communityAgentConciergeCore";
import {
  EVERYBODY_MENTION_ROLE_KEY,
  cancelEverybodyMentionBroadcastsForInteractionSource,
  scheduleEverybodyMentionBroadcast,
  textContainsEverybodyMentionToken,
} from "./communityMentionBroadcasts";

export type MentionKind = "user" | "community_agent" | "role";

export type MentionRow = {
  _id: any;
  communityId: any;
  channelId?: any;
  rootId?: any;
  replyId?: any;
  mentionKind: MentionKind;
  mentionedUserId?: any;
  mentionedAgentKey?: string;
  mentionedRoleKey?: string;
  notifyState: "pending" | "sent" | "suppressed" | "read";
  createdAt: number;
  updatedAt: number;
};

export type UserInteractionMentionSpec = { kind: "user"; userId: any; sourceRoleKey?: string };

export type InteractionMentionSpec =
  | UserInteractionMentionSpec
  | { kind: "community_agent"; agentKey: string }
  | { kind: "role"; roleKey: string };

export const MAX_INTERACTION_MENTIONS_PER_BUNDLE = 24;
const MAX_INTERACTION_MENTIONS_PER_WRITE = 24;
const MAX_INTERACTION_MENTION_LIFECYCLE_ROWS = MAX_INTERACTION_MENTIONS_PER_WRITE + 8;

export async function listMentionsForRoot(ctx: any, rootId: any): Promise<MentionRow[]> {
  return (await ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_root", (q: any) => q.eq("rootId", rootId))
    .take(MAX_INTERACTION_MENTIONS_PER_BUNDLE)) as MentionRow[];
}

export async function listMentionsForReply(ctx: any, replyId: any): Promise<MentionRow[]> {
  return (await ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .take(MAX_INTERACTION_MENTIONS_PER_BUNDLE)) as MentionRow[];
}

async function listMentionRowsForInteractionLifecycle(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
}): Promise<MentionRow[]> {
  // Source/direct mention rows are bounded at write time. Broadcast recipient
  // rows are unbounded fanout projections and are cleaned by sourceBroadcastId.
  return (await args.ctx.db
    .query("communityInteractionMentions" as any)
    .withIndex(args.targetType === "reply" ? "by_reply" : "by_root", (q: any) =>
      q.eq(args.targetType === "reply" ? "replyId" : "rootId", args.targetId),
    )
    .take(MAX_INTERACTION_MENTION_LIFECYCLE_ROWS)) as MentionRow[];
}

async function suppressPendingMentionRows(ctx: any, rows: Array<{ _id: any }>, nowMs: number): Promise<void> {
  for (const row of rows) {
    await settleMentionRowInternal({
      ctx,
      mentionId: row._id,
      toState: "suppressed",
      nowMs,
    });
  }
}

async function suppressPendingMentionsForInteractionSource(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  nowMs: number;
}): Promise<void> {
  await suppressPendingMentionRows(
    args.ctx,
    await listMentionRowsForInteractionLifecycle(args),
    args.nowMs,
  );
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function interactionTextContainsAtToken(text: string, tokenLabel: unknown): boolean {
  const normalizedLabel = String(tokenLabel ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!normalizedLabel) return false;
  const pattern = new RegExp(`(^|\\s)@${escapeRegExp(normalizedLabel)}(?![A-Za-z0-9_-])`, "i");
  return pattern.test(text);
}

function interactionTextContainsHandleMention(text: string, handle: unknown): boolean {
  return interactionTextContainsAtToken(text, handle);
}

function interactionTextContainsRoleMention(text: string, roleKey: unknown): boolean {
  if (String(roleKey ?? "").trim().replace(/^@+/, "").toLowerCase() === EVERYBODY_MENTION_ROLE_KEY) {
    return textContainsEverybodyMentionToken(text);
  }
  return interactionTextContainsAtToken(text, roleKey);
}

async function interactionTextContainsCommunityAgentMention(args: {
  ctx: any;
  communityId: any;
  text: string;
}): Promise<boolean> {
  const community = (await args.ctx.db.get(args.communityId as any)) as { name?: string } | null;
  return interactionTextContainsAtToken(args.text, community?.name);
}

export async function suppressPendingMentionsMissingFromInteractionText(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  text: string;
  nowMs: number;
}): Promise<void> {
  if (!textContainsEverybodyMentionToken(args.text)) {
    await cancelEverybodyMentionBroadcastsForInteractionSource({
      ctx: args.ctx,
      targetType: args.targetType,
      targetId: args.targetId,
      nowMs: args.nowMs,
      includeReplySources: false,
      errorCode: "source_mention_removed",
    });
  }
  const rows = await listMentionRowsForInteractionLifecycle(args);
  for (const row of rows) {
    if (row.notifyState !== "pending") continue;
    if (
      row.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY &&
      interactionTextContainsRoleMention(args.text, EVERYBODY_MENTION_ROLE_KEY)
    ) {
      continue;
    }
    if (row.mentionKind === "user" && row.mentionedUserId) {
      const user = (await args.ctx.db.get(row.mentionedUserId)) as { handle?: string; normalizedHandle?: string } | null;
      if (user && interactionTextContainsHandleMention(args.text, user.handle ?? user.normalizedHandle)) {
        continue;
      }
    }
    if (
      row.mentionKind === "community_agent" &&
      row.mentionedAgentKey === "community_agent" &&
      (await interactionTextContainsCommunityAgentMention({
        ctx: args.ctx,
        communityId: row.communityId,
        text: args.text,
      }))
    ) {
      continue;
    }
    await suppressPendingMentionRows(args.ctx, [row], args.nowMs);
  }
}

export async function suppressPendingMentionsForDeletedInteractionTarget(args: {
  ctx: any;
  targetType: "root" | "reply";
  targetId: any;
  nowMs: number;
}): Promise<void> {
  await cancelEverybodyMentionBroadcastsForInteractionSource({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.targetId,
    nowMs: args.nowMs,
    includeReplySources: args.targetType === "root",
    errorCode: "source_deleted",
  });
  if (args.targetType === "reply") {
    await suppressPendingMentionsForInteractionSource(args);
    return;
  }
  await suppressPendingMentionsForInteractionSource(args);
  const replies = (await args.ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_root_createdAt", (q: any) => q.eq("rootId", args.targetId))
    .take(500)) as Array<{ _id: any }>;
  for (const reply of replies) {
    await suppressPendingMentionRows(
      args.ctx,
      await listMentionRowsForInteractionLifecycle({
        ctx: args.ctx,
        targetType: "reply",
        targetId: reply._id,
      }),
      args.nowMs,
    );
  }
}

async function mapMention(ctx: any, row: MentionRow, userIdCache?: Map<string, string | null>) {
  return {
    id: normalizeIdValue(row._id),
    mention_kind: row.mentionKind,
    // Same identity conversion as actors: the frontend knows users by their
    // public (auth-subject) id, so a raw canonical id here can never resolve
    // to a profile — the chip would silently degrade to plain text.
    mentioned_user_id: row.mentionedUserId
      ? await resolvePublicUserId(ctx, row.mentionedUserId, userIdCache)
      : null,
    mentioned_agent_key: row.mentionedAgentKey ?? null,
    mentioned_role_key: row.mentionedRoleKey ?? null,
    notify_state: row.notifyState,
  };
}

export async function mapMentions(ctx: any, rows: MentionRow[], userIdCache?: Map<string, string | null>) {
  const mapped = [];
  for (const row of rows) mapped.push(await mapMention(ctx, row, userIdCache));
  return mapped;
}

async function validateEverybodyMentionForWrite(args: {
  ctx: any;
  communityId: any;
  actorUserId: any;
  targetKind: "root" | "reply";
}): Promise<void> {
  if (args.targetKind !== "root") {
    throw new Error("interaction_mention_everybody_reply_not_allowed");
  }
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
}

export async function resolveMentionedUserIdsForInteractionWrite(args: {
  ctx: any;
  communityId: any;
  actorUserId: any;
  targetKind: "root" | "reply";
  text: string;
  mentions: Array<{ userId?: any; agentKey?: any; roleKey?: any }>;
}): Promise<InteractionMentionSpec[]> {
  const seenAgents = new Set<string>();
  const seenRoles = new Set<string>();
  const userSpecsById = new Map<string, UserInteractionMentionSpec>();
  const out: InteractionMentionSpec[] = [];
  let directMentionCount = 0;
  for (const mention of args.mentions) {
    if (mention.roleKey) {
      if (mention.userId || mention.agentKey) throw new Error("interaction_mention_payload_ambiguous");
      const roleKey = String(mention.roleKey ?? "").trim().replace(/^@+/, "").toLowerCase();
      if (roleKey !== EVERYBODY_MENTION_ROLE_KEY) throw new Error("interaction_mention_role_unknown");
      if (seenRoles.has(roleKey)) continue;
      if (!interactionTextContainsRoleMention(args.text, roleKey)) {
        throw new Error("interaction_mention_token_missing");
      }
      seenRoles.add(roleKey);
      await validateEverybodyMentionForWrite({
        ctx: args.ctx,
        communityId: args.communityId,
        actorUserId: args.actorUserId,
        targetKind: args.targetKind,
      });
      out.push({ kind: "role", roleKey });
      continue;
    }
    // Community-agent mentions carry an agent key, never a user id. Only the
    // canonical community agent is taggable.
    if (!mention.userId && mention.agentKey) {
      const agentKey = String(mention.agentKey ?? "").trim();
      if (agentKey !== "community_agent") throw new Error("interaction_mention_agent_unknown");
      if (seenAgents.has(agentKey)) continue;
      seenAgents.add(agentKey);
      if (directMentionCount >= MAX_INTERACTION_MENTIONS_PER_WRITE) {
        throw new Error("interaction_mentions_limit_exceeded");
      }
      if (
        !(await interactionTextContainsCommunityAgentMention({
          ctx: args.ctx,
          communityId: args.communityId,
          text: args.text,
        }))
      ) {
        throw new Error("interaction_mention_token_missing");
      }
      directMentionCount += 1;
      out.push({ kind: "community_agent", agentKey });
      continue;
    }
    // Clients know members by canonical users id or by auth subject (the
    // profiles projection exposes the latter as user_id) — resolve either
    // form here; the mention row always stores the canonical users id.
    const rawUserId = String(mention.userId ?? "").trim();
    if (!rawUserId) continue;
    const canonicalId = args.ctx.db.normalizeId("users" as any, rawUserId);
    const user = canonicalId
      ? await args.ctx.db.get(canonicalId)
      : await args.ctx.db
          .query("users" as any)
          .withIndex("by_authSubject", (q: any) => q.eq("authSubject", rawUserId))
          .first();
    if (!user) throw new Error("interaction_mention_user_not_found");
    const normalized = normalizeIdValue(user._id);
    if (!normalized || userSpecsById.has(normalized)) continue;
    if (!interactionTextContainsHandleMention(args.text, user.handle ?? user.normalizedHandle)) {
      throw new Error("interaction_mention_token_missing");
    }
    if (directMentionCount >= MAX_INTERACTION_MENTIONS_PER_WRITE) {
      throw new Error("interaction_mentions_limit_exceeded");
    }
    directMentionCount += 1;
    // Recipient authority is checked against the persisted source and channel
    // by insertCommunityInteractionMentionRows in the same transaction.
    const spec: UserInteractionMentionSpec = { kind: "user", userId: user._id };
    userSpecsById.set(normalized, spec);
    out.push(spec);
  }
  return out;
}

export async function insertCommunityInteractionMentionRows(args: {
  ctx: any;
  communityId: any;
  channelId: any;
  rootId?: any;
  replyId?: any;
  mentionedUserIds: InteractionMentionSpec[];
  actorUserId: any;
  nowMs: number;
}): Promise<{ communityAgentMention: ConciergeMentionRow | null }> {
  let communityAgentMention: ConciergeMentionRow | null = null;
  const orderedMentionSpecs = args.mentionedUserIds
    .slice()
    .sort((left, right) => (left.kind === "role" ? -1 : 0) - (right.kind === "role" ? -1 : 0));
  const hasEverybodyRoleMention = orderedMentionSpecs.some(
    (spec) => spec.kind === "role" && spec.roleKey === EVERYBODY_MENTION_ROLE_KEY,
  );
  if (hasEverybodyRoleMention && args.replyId) {
    throw new Error("interaction_mention_everybody_reply_not_allowed");
  }
  if (hasEverybodyRoleMention && !args.rootId) {
    throw new Error("interaction_mention_broadcast_source_required");
  }
  for (const spec of orderedMentionSpecs) {
    if (spec.kind === "user" && !(await resolveNotificationRecipientSource({
      ...args, userId: spec.userId,
    }))) throw new Error("interaction_mention_user_not_allowed");
    const mentionId = await args.ctx.db.insert("communityInteractionMentions" as any, {
      communityId: args.communityId,
      channelId: args.channelId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      mentionKind: spec.kind,
      ...(spec.kind === "user" ? { mentionedUserId: spec.userId } : {}),
      ...(spec.kind === "community_agent" ? { mentionedAgentKey: spec.agentKey } : {}),
      ...(spec.kind === "user" && spec.sourceRoleKey ? { mentionedRoleKey: spec.sourceRoleKey } : {}),
      ...(spec.kind === "role" ? { mentionedRoleKey: spec.roleKey } : {}),
      notifyState: "pending",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    if (spec.kind === "role" && spec.roleKey === EVERYBODY_MENTION_ROLE_KEY) {
      await scheduleEverybodyMentionBroadcast({
        ctx: args.ctx,
        communityId: args.communityId,
        channelId: args.channelId,
        rootId: args.rootId,
        actorUserId: args.actorUserId,
        sourceMentionId: mentionId,
        nowMs: args.nowMs,
      });
    }
    if (spec.kind === "community_agent") {
      communityAgentMention = {
        _id: mentionId,
        communityId: args.communityId,
        ...(args.rootId ? { rootId: args.rootId } : {}),
        ...(args.replyId ? { replyId: args.replyId } : {}),
        mentionKind: spec.kind,
        mentionedAgentKey: spec.agentKey,
        notifyState: "pending",
      };
    }
  }
  return { communityAgentMention };
}
