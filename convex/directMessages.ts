import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  resolvePublicUserId,
  toIsoString,
  type CommunityLike,
} from "./communityCore";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import { resolveUserProfileDisplayProjectionForUser } from "./userProfileProjection";

type UserRow = {
  _id: any;
  authSubject?: string;
  displayName?: string;
  handle?: string;
  normalizedHandle?: string;
  avatarUrl?: string;
};

type DirectMessageConversationLike = {
  _id: any;
  kind: "direct";
  canonicalKey: string;
  createdByUserId: any;
  createdFromCommunityId: any;
  lastSeq: number;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
};

type DirectMessageParticipantLike = {
  _id: any;
  conversationId: any;
  participantType: "user" | "agent";
  userId?: any;
  agentKind?: string;
  status: "active" | "left";
  lastReadSeq: number;
  createdAt: number;
  updatedAt: number;
};

type DirectMessageLike = {
  _id: any;
  conversationId: any;
  seq: number;
  senderType: "user" | "agent" | "system";
  senderUserId?: any;
  senderAgentParticipantId?: any;
  contentJson: unknown;
  createdAt: number;
  updatedAt: number;
};

const MAX_DM_TEXT_CHARS = 4000;
const MAX_DM_MESSAGE_ROWS = 200;
const DIRECT_CONVERSATION_KIND = "direct" as const;

function normalizePublicUserId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeDirectMessageText(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("dm_message_text_required");
  return text.slice(0, MAX_DM_TEXT_CHARS);
}

function buildDirectConversationCanonicalKey(leftUserId: any, rightUserId: any): string {
  const [left, right] = [normalizeIdValue(leftUserId), normalizeIdValue(rightUserId)].sort();
  if (!left || !right) throw new Error("dm_participant_required");
  return `dm:direct:v1:${left}:${right}`;
}

async function findUserByPublicId(ctx: any, publicUserId: string): Promise<UserRow | null> {
  const normalized = normalizePublicUserId(publicUserId);
  if (!normalized) return null;
  return (await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalized))
    .first()) as UserRow | null;
}

async function listConversationParticipants(
  ctx: any,
  conversationId: any,
): Promise<DirectMessageParticipantLike[]> {
  return (await ctx.db
    .query("dmParticipants" as any)
    .withIndex("by_conversation", (q: any) => q.eq("conversationId", conversationId))
    .collect()) as DirectMessageParticipantLike[];
}

async function ensureUserParticipant(args: {
  ctx: any;
  conversationId: any;
  userId: any;
  nowMs: number;
}): Promise<void> {
  const existing = (await args.ctx.db
    .query("dmParticipants" as any)
    .withIndex("by_conversation_user", (q: any) =>
      q.eq("conversationId", args.conversationId).eq("userId", args.userId),
    )
    .first()) as DirectMessageParticipantLike | null;
  if (existing) {
    if (existing.status !== "active") {
      await args.ctx.db.patch(existing._id, {
        status: "active",
        updatedAt: args.nowMs,
      });
    }
    return;
  }
  await args.ctx.db.insert("dmParticipants" as any, {
    conversationId: args.conversationId,
    participantType: "user",
    userId: args.userId,
    status: "active",
    lastReadSeq: 0,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function requireActiveUserParticipant(args: {
  ctx: any;
  conversationId: any;
  userId: any;
}): Promise<{
  conversation: DirectMessageConversationLike;
  participant: DirectMessageParticipantLike;
}> {
  const conversation = (await args.ctx.db.get(args.conversationId)) as DirectMessageConversationLike | null;
  if (!conversation) throw new Error("dm_conversation_not_found");
  const participant = (await args.ctx.db
    .query("dmParticipants" as any)
    .withIndex("by_conversation_user", (q: any) =>
      q.eq("conversationId", args.conversationId).eq("userId", args.userId),
    )
    .first()) as DirectMessageParticipantLike | null;
  if (!participant || participant.status !== "active") throw new Error("dm_participant_required");
  return { conversation, participant };
}

async function mapDirectParticipant(ctx: any, row: DirectMessageParticipantLike) {
  if (row.participantType === "agent") {
    return {
      id: String(row._id),
      participant_type: "agent" as const,
      user_id: null,
      display_name: row.agentKind ?? "AI agent",
      avatar_url: null,
      avatar_focus_x: 0.5,
      avatar_focus_y: 0.5,
      avatar_zoom: 1,
      status: row.status,
      last_read_seq: Math.max(0, Math.floor(row.lastReadSeq ?? 0)),
    };
  }
  const user = row.userId ? ((await ctx.db.get(row.userId)) as UserRow | null) : null;
  const profile = user
    ? await resolveUserProfileDisplayProjectionForUser(ctx, user)
    : {
        display_name: null,
        avatar_url: null,
        avatar_focus_x: 0.5,
        avatar_focus_y: 0.5,
        avatar_zoom: 1,
      };
  return {
    id: String(row._id),
    participant_type: "user" as const,
    user_id: row.userId ? await resolvePublicUserId(ctx, row.userId) : null,
    display_name: profile.display_name ?? user?.displayName ?? null,
    avatar_url: profile.avatar_url ?? null,
    avatar_focus_x: profile.avatar_focus_x ?? 0.5,
    avatar_focus_y: profile.avatar_focus_y ?? 0.5,
    avatar_zoom: profile.avatar_zoom ?? 1,
    status: row.status,
    last_read_seq: Math.max(0, Math.floor(row.lastReadSeq ?? 0)),
  };
}

async function mapDirectConversation(ctx: any, row: DirectMessageConversationLike) {
  const community = (await ctx.db.get(row.createdFromCommunityId)) as CommunityLike | null;
  const participants = await listConversationParticipants(ctx, row._id);
  return {
    id: String(row._id),
    kind: row.kind,
    created_from_community: community
      ? {
          id: String(community._id),
          slug: community.slug,
          name: community.name,
        }
      : null,
    last_seq: Math.max(0, Math.floor(row.lastSeq ?? 0)),
    last_message_at:
      typeof row.lastMessageAt === "number" && Number.isFinite(row.lastMessageAt)
        ? toIsoString(row.lastMessageAt)
        : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
    participants: await Promise.all(participants.map((participant) => mapDirectParticipant(ctx, participant))),
  };
}

async function mapDirectMessage(ctx: any, row: DirectMessageLike) {
  return {
    id: String(row._id),
    conversation_id: String(row.conversationId),
    seq: Math.max(0, Math.floor(row.seq)),
    sender_type: row.senderType,
    sender_user_id: row.senderUserId ? await resolvePublicUserId(ctx, row.senderUserId) : null,
    content_json: row.contentJson,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const ensureDirectConversationFromCommunity = mutation({
  args: {
    authSubject: v.optional(v.string()),
    targetUserId: v.string(),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const targetUser = await findUserByPublicId(ctx, args.targetUserId);
    if (!targetUser) throw new Error("dm_target_not_found");
    if (normalizeIdValue(targetUser._id) === normalizeIdValue(viewerUserId)) {
      throw new Error("dm_target_self");
    }

    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: viewerUserId,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: targetUser._id,
    });
    await requireProfileSetupCompleteForUser(ctx, viewerUserId);

    const nowMs = Date.now();
    const canonicalKey = buildDirectConversationCanonicalKey(viewerUserId, targetUser._id);
    let conversation = (await ctx.db
      .query("dmConversations" as any)
      .withIndex("by_canonicalKey", (q: any) => q.eq("canonicalKey", canonicalKey))
      .first()) as DirectMessageConversationLike | null;

    if (!conversation) {
      const conversationId = await ctx.db.insert("dmConversations" as any, {
        kind: DIRECT_CONVERSATION_KIND,
        canonicalKey,
        createdByUserId: viewerUserId,
        createdFromCommunityId: args.communityId,
        lastSeq: 0,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      conversation = (await ctx.db.get(conversationId)) as DirectMessageConversationLike | null;
    } else {
      await ctx.db.patch(conversation._id, { updatedAt: nowMs });
      conversation = (await ctx.db.get(conversation._id)) as DirectMessageConversationLike | null;
    }
    if (!conversation) throw new Error("dm_conversation_create_failed");

    await ensureUserParticipant({
      ctx,
      conversationId: conversation._id,
      userId: viewerUserId,
      nowMs,
    });
    await ensureUserParticipant({
      ctx,
      conversationId: conversation._id,
      userId: targetUser._id,
      nowMs,
    });

    return await mapDirectConversation(ctx, conversation);
  },
});

export const listMyDirectConversations = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const safeLimit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 30)));
    const participants = (await ctx.db
      .query("dmParticipants" as any)
      .withIndex("by_user_status", (q: any) => q.eq("userId", viewerUserId).eq("status", "active"))
      .collect()) as DirectMessageParticipantLike[];
    const conversations: DirectMessageConversationLike[] = [];
    for (const participant of participants) {
      const conversation = (await ctx.db.get(participant.conversationId)) as DirectMessageConversationLike | null;
      if (conversation) conversations.push(conversation);
    }
    conversations.sort((left, right) => right.updatedAt - left.updatedAt);
    return await Promise.all(conversations.slice(0, safeLimit).map((row) => mapDirectConversation(ctx, row)));
  },
});

export const listDirectMessages = query({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
    beforeSeq: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });
    const safeLimit = Math.max(1, Math.min(MAX_DM_MESSAGE_ROWS, Math.floor(args.limit ?? 100)));
    const beforeSeq =
      typeof args.beforeSeq === "number" && Number.isFinite(args.beforeSeq)
        ? Math.max(0, Math.floor(args.beforeSeq))
        : null;
    const rows = (await ctx.db
      .query("dmMessages" as any)
      .withIndex("by_conversation_seq", (q: any) =>
        beforeSeq === null
          ? q.eq("conversationId", args.conversationId)
          : q.eq("conversationId", args.conversationId).lt("seq", beforeSeq),
      )
      .order("desc")
      .take(safeLimit)) as DirectMessageLike[];
    return await Promise.all(rows.reverse().map((row) => mapDirectMessage(ctx, row)));
  },
});

export const sendDirectMessage = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { conversation } = await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });
    await requireProfileSetupCompleteForUser(ctx, viewerUserId);

    const nowMs = Date.now();
    const seq = Math.max(0, Math.floor(conversation.lastSeq ?? 0)) + 1;
    const text = normalizeDirectMessageText(args.text);
    const messageId = await ctx.db.insert("dmMessages" as any, {
      conversationId: conversation._id,
      seq,
      senderType: "user",
      senderUserId: viewerUserId,
      contentJson: { text },
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(conversation._id, {
      lastSeq: seq,
      lastMessageAt: nowMs,
      updatedAt: nowMs,
    });
    const message = (await ctx.db.get(messageId)) as DirectMessageLike | null;
    if (!message) throw new Error("dm_message_create_failed");
    return await mapDirectMessage(ctx, message);
  },
});
