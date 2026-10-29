import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolvePublicUserId,
  toIsoString,
  type CommunityLike,
  type CommunityMembershipLike,
} from "./communityCore";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireNotTestMemberOutsideCommunity } from "./communityTestMemberCore";
import { resolveViewerDirectMessageRelationship } from "./profileRelationshipCore";
import { resolveUserProfileDisplayProjectionForUser } from "./userProfileProjection";
import { getUniqueUserByNormalizedHandle } from "./profileCore";
import { stripChatInlineMarkdown } from "../shared/chatInlineMarkdown";
import {
  DIRECT_MESSAGE_TYPING_PRESENCE_SCAN_LIMIT,
  DIRECT_MESSAGE_TYPING_PRESENCE_VISIBLE_LIMIT,
  TYPING_PRESENCE_LEASE_DURATION_MS,
} from "../shared/typingPresenceContract";
import { nextDirectMessageReadSeq } from "./directMessageReadCore";
import { SITE_DM_PAGE_SIZE, siteDirectConversation, siteDirectMessage } from "../shared/directMessageSiteShape";

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
  lastActivityAt?: number;
  mutedAt?: number;
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
  clientMessageId?: string;
  contentJson: unknown;
  createdAt: number;
  updatedAt: number;
};

type DirectMessageTypingPresenceLike = {
  _id: any;
  conversationId: any;
  userId: any;
  displayUntil: number;
  createdAt: number;
  updatedAt: number;
};

type StoredDirectMessageAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  storageId: string;
};

const MAX_DM_TEXT_CHARS = 4000;
const MAX_DM_PREVIEW_CHARS = 120;
const MAX_DM_MESSAGE_ROWS = 200;
const MAX_DM_STORED_ATTACHMENTS = 8;
const MAX_DM_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_DM_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_DM_ATTACHMENT_NAME_CHARS = 256;
const MAX_DM_ATTACHMENT_MIME_CHARS = 160;
const MAX_DM_GLOBAL_SOURCE_COMMUNITIES = 12;
const MAX_DM_GLOBAL_OWNED_COMMUNITY_ROWS = 12;
const MAX_DM_GLOBAL_SOURCE_MEMBERSHIP_ROWS = 48;
const MAX_DM_GLOBAL_RECIPIENT_MEMBERSHIP_ROWS = 150;
const MAX_DM_GLOBAL_RECIPIENT_CANDIDATE_ROWS = 150;
const MAX_DM_NETWORK_PEOPLE_ROWS = 30;
const MAX_DM_NETWORK_PRESENCE_ROWS_PER_COMMUNITY = 40;
const MAX_DM_NETWORK_EXCLUDE_USER_IDS = 200;
const MAX_DM_PEER_PRESENCE_TARGETS = 50;
const MAX_DM_PEER_PRESENCE_ROWS_PER_USER = 8;
const MAX_DM_CLIENT_MESSAGE_ID_CHARS = 64;
const MAX_DM_BLOCK_SCAN_ROWS = 200;
const DM_EMAIL_NOTIFY_DELAY_MS = 2 * 60 * 1000;
const DM_MESSAGE_RATE_LIMIT = 25;
const DM_MESSAGE_RATE_WINDOW_MS = 60 * 1000;
const DM_NEW_CONVERSATION_RATE_LIMIT = 15;
const DM_NEW_CONVERSATION_RATE_WINDOW_MS = 60 * 60 * 1000;
const DIRECT_CONVERSATION_KIND = "direct" as const;

type CommunityPresenceLike = {
  userId: any;
  lastSeenAt?: number | null;
};

type DirectMessageBlockLike = {
  _id: any;
  blockerUserId: any;
  blockedUserId: any;
};

type DirectMessageRateCounterLike = {
  _id: any;
  userId: any;
  kind: "message" | "conversation";
  windowStartMs: number;
  count: number;
};

function normalizePublicUserId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeDirectMessageText(raw: unknown): string {
  const text = String(raw ?? "").trim();
  return text.slice(0, MAX_DM_TEXT_CHARS);
}

function createAttachmentId(): string {
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDirectAttachmentName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  return (name || "attachment").slice(0, MAX_DM_ATTACHMENT_NAME_CHARS);
}

function normalizeDirectAttachmentMime(raw: unknown): string | null {
  const mime = String(raw ?? "").trim().toLowerCase();
  return mime ? mime.slice(0, MAX_DM_ATTACHMENT_MIME_CHARS) : null;
}

function isAllowedDirectAttachment(rawType: "image" | "file", mime: string | null, name: string): boolean {
  const normalizedMime = String(mime ?? "").toLowerCase();
  const normalizedName = name.toLowerCase();
  const blockedMimes = new Set([
    "application/gzip",
    "application/vnd.microsoft.portable-executable",
    "application/x-7z-compressed",
    "application/x-msdownload",
    "application/x-rar-compressed",
    "application/x-sh",
    "application/zip",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/svg+xml",
  ]);
  if (normalizedMime && blockedMimes.has(normalizedMime)) return false;
  if (rawType === "image") {
    if (normalizedMime) {
      return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(normalizedMime);
    }
    return (
      [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((extension) => normalizedName.endsWith(extension))
    );
  }
  const allowedFileMimes = new Set([
    "application/json",
    "application/msword",
    "application/pdf",
    "application/rtf",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "text/markdown",
    "text/plain",
  ]);
  if (normalizedMime && allowedFileMimes.has(normalizedMime)) return true;
  return [
    ".csv",
    ".doc",
    ".docx",
    ".json",
    ".md",
    ".pdf",
    ".ppt",
    ".pptx",
    ".rtf",
    ".txt",
    ".xls",
    ".xlsx",
  ].some((extension) => normalizedName.endsWith(extension));
}

function normalizeStoredDirectMessageAttachment(
  raw: unknown,
  options: { enforceWritePolicy?: boolean } = {},
): StoredDirectMessageAttachment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : createAttachmentId();
  const name = normalizeDirectAttachmentName(record.name);
  const type = record.type === "image" ? "image" : "file";
  const mime = normalizeDirectAttachmentMime(record.mime);
  const sizeRaw = Number(record.size);
  const size = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;
  const storageIdRaw =
    typeof record.storageId === "string"
      ? record.storageId
      : typeof record.storage_id === "string"
        ? record.storage_id
        : "";
  const storageId = storageIdRaw.trim();
  if (!storageId) {
    if (options.enforceWritePolicy) throw new Error("dm_attachment_storage_required");
    return null;
  }
  if (!isAllowedDirectAttachment(type, mime, name)) {
    if (options.enforceWritePolicy) throw new Error("dm_attachment_type_not_supported");
    return null;
  }
  if (size > MAX_DM_ATTACHMENT_BYTES) {
    if (options.enforceWritePolicy) throw new Error("dm_attachment_too_large");
    return null;
  }
  return {
    id,
    name,
    type,
    mime,
    size,
    storageId,
  };
}

function normalizeStoredDirectMessageAttachments(
  raw: unknown,
  options: { enforceWritePolicy?: boolean } = {},
): StoredDirectMessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  if (options.enforceWritePolicy && raw.length > MAX_DM_STORED_ATTACHMENTS) {
    throw new Error("dm_attachment_limit_exceeded");
  }
  const out: StoredDirectMessageAttachment[] = [];
  let totalBytes = 0;
  for (const item of raw) {
    if (out.length >= MAX_DM_STORED_ATTACHMENTS) break;
    const normalized = normalizeStoredDirectMessageAttachment(item, options);
    if (!normalized) continue;
    totalBytes += normalized.size;
    if (totalBytes > MAX_DM_ATTACHMENT_TOTAL_BYTES) {
      if (options.enforceWritePolicy) throw new Error("dm_attachment_total_too_large");
      break;
    }
    out.push(normalized);
  }
  return out;
}

async function maybeResolveDirectMessageStorageUrl(ctx: any, storageId: unknown): Promise<string | null> {
  const resolvedStorageId = String(storageId ?? "").trim();
  if (!resolvedStorageId) return null;
  const resolved = await ctx.storage.getUrl(resolvedStorageId as any);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

async function mapDirectMessageContentJsonForRead(ctx: any, contentJson: unknown): Promise<unknown> {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return contentJson;
  const record = contentJson as Record<string, unknown>;
  const attachments = normalizeStoredDirectMessageAttachments(record.attachments);
  if (attachments.length === 0) {
    return Array.isArray(record.attachments) ? { ...record, attachments: [] } : contentJson;
  }
  const resolvedAttachments = await Promise.all(
    attachments.map(async (attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime,
      size: attachment.size,
      storage_id: attachment.storageId,
      url: await maybeResolveDirectMessageStorageUrl(ctx, attachment.storageId),
    })),
  );
  return {
    ...record,
    attachments: resolvedAttachments,
  };
}

function readDirectMessageTextPreview(contentJson: unknown): string | null {
  const attachments =
    contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
      ? normalizeStoredDirectMessageAttachments((contentJson as Record<string, unknown>).attachments)
      : [];
  const rawText =
    typeof contentJson === "string"
      ? contentJson
      : contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
        ? (contentJson as Record<string, unknown>).text
        : null;
  const normalized = stripChatInlineMarkdown(rawText).replace(/\s+/g, " ").trim();
  if (!normalized) {
    if (attachments.length === 0) return null;
    if (attachments.length === 1) return attachments[0]?.type === "image" ? "Sent an image" : "Sent a file";
    return "Sent attachments";
  }
  if (normalized.length <= MAX_DM_PREVIEW_CHARS) return normalized;
  return `${normalized.slice(0, MAX_DM_PREVIEW_CHARS - 3).trimEnd()}...`;
}

function buildDirectConversationCanonicalKey(leftUserId: any, rightUserId: any): string {
  const [left, right] = [normalizeIdValue(leftUserId), normalizeIdValue(rightUserId)].sort();
  if (!left || !right) throw new Error("dm_participant_required");
  return `dm:direct:v1:${left}:${right}`;
}

async function findDirectMessageBlockRow(
  ctx: any,
  blockerUserId: any,
  blockedUserId: any,
): Promise<DirectMessageBlockLike | null> {
  return (await ctx.db
    .query("dmBlocks" as any)
    .withIndex("by_blocker_blocked", (q: any) =>
      q.eq("blockerUserId", blockerUserId).eq("blockedUserId", blockedUserId),
    )
    .first()) as DirectMessageBlockLike | null;
}

async function directMessageBlockExistsBetween(
  ctx: any,
  leftUserId: any,
  rightUserId: any,
): Promise<boolean> {
  const [leftBlocksRight, rightBlocksLeft] = await Promise.all([
    findDirectMessageBlockRow(ctx, leftUserId, rightUserId),
    findDirectMessageBlockRow(ctx, rightUserId, leftUserId),
  ]);
  return Boolean(leftBlocksRight || rightBlocksLeft);
}

async function listDirectMessageBlockedUserKeysForViewer(
  ctx: any,
  viewerUserId: any,
): Promise<Set<string>> {
  const [blockedByViewer, blockingViewer] = await Promise.all([
    ctx.db
      .query("dmBlocks" as any)
      .withIndex("by_blocker_blocked", (q: any) => q.eq("blockerUserId", viewerUserId))
      .take(MAX_DM_BLOCK_SCAN_ROWS) as Promise<DirectMessageBlockLike[]>,
    ctx.db
      .query("dmBlocks" as any)
      .withIndex("by_blocked_blocker", (q: any) => q.eq("blockedUserId", viewerUserId))
      .take(MAX_DM_BLOCK_SCAN_ROWS) as Promise<DirectMessageBlockLike[]>,
  ]);
  const keys = new Set<string>();
  for (const row of blockedByViewer) {
    const key = normalizeIdValue(row.blockedUserId);
    if (key) keys.add(key);
  }
  for (const row of blockingViewer) {
    const key = normalizeIdValue(row.blockerUserId);
    if (key) keys.add(key);
  }
  return keys;
}

async function enforceDirectMessageRateLimit(args: {
  ctx: any;
  userId: any;
  kind: "message" | "conversation";
}): Promise<void> {
  const limit = args.kind === "message" ? DM_MESSAGE_RATE_LIMIT : DM_NEW_CONVERSATION_RATE_LIMIT;
  const windowMs =
    args.kind === "message" ? DM_MESSAGE_RATE_WINDOW_MS : DM_NEW_CONVERSATION_RATE_WINDOW_MS;
  const nowMs = Date.now();
  const counter = (await args.ctx.db
    .query("dmRateCounters" as any)
    .withIndex("by_user_kind", (q: any) => q.eq("userId", args.userId).eq("kind", args.kind))
    .first()) as DirectMessageRateCounterLike | null;
  if (!counter) {
    await args.ctx.db.insert("dmRateCounters" as any, {
      userId: args.userId,
      kind: args.kind,
      windowStartMs: nowMs,
      count: 1,
      updatedAt: nowMs,
    });
    return;
  }
  const windowStartMs = Math.max(0, Math.floor(counter.windowStartMs ?? 0));
  const isSameWindow = nowMs - windowStartMs < windowMs;
  if (!isSameWindow) {
    await args.ctx.db.patch(counter._id, {
      windowStartMs: nowMs,
      count: 1,
      updatedAt: nowMs,
    });
    return;
  }
  const count = Math.max(0, Math.floor(counter.count ?? 0));
  if (count >= limit) {
    throw new Error("dm_rate_limited");
  }
  await args.ctx.db.patch(counter._id, {
    count: count + 1,
    updatedAt: nowMs,
  });
}

async function requireDirectMessageRelationshipAccess(args: {
  ctx: any;
  viewerUserId: any;
  targetUserId: any;
  preferredCommunityId?: any | null;
  requiredCommunityId?: any | null;
}): Promise<string> {
  // DM write access is defined by authenticated relationship, entitlement,
  // block, participant, and rate/payload checks. Public-profile completeness
  // is presentation state and must not become an authorization boundary.
  // Blocks fail with the same error as a missing mutual community so a block
  // is never revealed to the blocked side.
  if (await directMessageBlockExistsBetween(args.ctx, args.viewerUserId, args.targetUserId)) {
    throw new Error("dm_conversation_access_required");
  }
  const relationship = await resolveViewerDirectMessageRelationship({
    ctx: args.ctx,
    viewerUserId: args.viewerUserId,
    targetUserId: args.targetUserId,
    preferredCommunityId: args.preferredCommunityId ?? null,
  });
  const messageContextCommunityId = String(relationship.message_context_community_id ?? "").trim();
  if (!relationship.can_message || !messageContextCommunityId) {
    throw new Error("dm_conversation_access_required");
  }
  const requiredCommunityId = String(args.requiredCommunityId ?? "").trim();
  if (requiredCommunityId && messageContextCommunityId !== requiredCommunityId) {
    throw new Error("dm_conversation_access_required");
  }
  return messageContextCommunityId;
}

function normalizeRecipientSearch(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .slice(0, 80);
}

async function findUserByPublicId(ctx: any, publicUserId: string): Promise<UserRow | null> {
  const normalized = normalizePublicUserId(publicUserId);
  if (!normalized) return null;
  return (await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalized))
    .first()) as UserRow | null;
}

async function findUserByNormalizedHandle(ctx: any, normalizedHandle: string): Promise<UserRow | null> {
  const normalized = normalizeRecipientSearch(normalizedHandle);
  if (!normalized) return null;
  return await getUniqueUserByNormalizedHandle<UserRow>(ctx, normalized);
}

async function findDirectConversationByUsers(
  ctx: any,
  leftUserId: any,
  rightUserId: any,
): Promise<DirectMessageConversationLike | null> {
  const canonicalKey = buildDirectConversationCanonicalKey(leftUserId, rightUserId);
  return (await ctx.db
    .query("dmConversations" as any)
    .withIndex("by_canonicalKey", (q: any) => q.eq("canonicalKey", canonicalKey))
    .first()) as DirectMessageConversationLike | null;
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
  touchActivity: boolean;
  fallbackActivityAt?: number;
}): Promise<void> {
  const existing = (await args.ctx.db
    .query("dmParticipants" as any)
    .withIndex("by_conversation_user", (q: any) =>
      q.eq("conversationId", args.conversationId).eq("userId", args.userId),
    )
    .first()) as DirectMessageParticipantLike | null;
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.status !== "active") {
      patch.status = "active";
    }
    if (args.touchActivity) {
      patch.lastActivityAt = args.nowMs;
    } else if (
      typeof existing.lastActivityAt !== "number" &&
      typeof args.fallbackActivityAt === "number" &&
      Number.isFinite(args.fallbackActivityAt)
    ) {
      patch.lastActivityAt = args.fallbackActivityAt;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = args.nowMs;
      await args.ctx.db.patch(existing._id, patch);
    }
    return;
  }
  const initialActivityAt =
    args.touchActivity ||
    typeof args.fallbackActivityAt !== "number" ||
    !Number.isFinite(args.fallbackActivityAt)
      ? args.nowMs
      : args.fallbackActivityAt;
  await args.ctx.db.insert("dmParticipants" as any, {
    conversationId: args.conversationId,
    participantType: "user",
    userId: args.userId,
    status: "active",
    lastReadSeq: 0,
    lastActivityAt: initialActivityAt,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function touchActiveConversationParticipantsActivity(args: {
  ctx: any;
  conversationId: any;
  nowMs: number;
  senderParticipantId?: any;
  senderLastReadSeq?: number;
}): Promise<void> {
  const senderParticipantKey = normalizeIdValue(args.senderParticipantId);
  const senderLastReadSeq = Math.max(0, Math.floor(args.senderLastReadSeq ?? 0));
  const participants = await listConversationParticipants(args.ctx, args.conversationId);
  await Promise.all(
    participants
      .filter((participant) => participant.status === "active")
      .map((participant) => {
        const currentLastReadSeq = Math.max(
          0,
          Math.floor(participant.lastReadSeq ?? 0),
        );
        const isSender =
          Boolean(senderParticipantKey) &&
          normalizeIdValue(participant._id) === senderParticipantKey;
        const nextLastReadSeq = isSender
          ? nextDirectMessageReadSeq(
              currentLastReadSeq,
              senderLastReadSeq,
              senderLastReadSeq,
            )
          : currentLastReadSeq;
        const patch: Record<string, unknown> = {
          lastActivityAt: args.nowMs,
          updatedAt: args.nowMs,
        };
        if (nextLastReadSeq > currentLastReadSeq) {
          patch.lastReadSeq = nextLastReadSeq;
        }
        return args.ctx.db.patch(participant._id, patch);
      }),
  );
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

async function requireDirectConversationSendAccess(args: {
  ctx: any;
  conversation: DirectMessageConversationLike;
  viewerUserId: any;
}): Promise<void> {
  if (args.conversation.kind !== DIRECT_CONVERSATION_KIND) {
    throw new Error("dm_conversation_access_required");
  }

  const viewerUserKey = normalizeIdValue(args.viewerUserId);
  const activeUserParticipants = (await listConversationParticipants(args.ctx, args.conversation._id))
    .filter(
      (participant) =>
        participant.status === "active" &&
        participant.participantType === "user" &&
        normalizeIdValue(participant.userId),
    );
  const viewerParticipant = activeUserParticipants.find(
    (participant) => normalizeIdValue(participant.userId) === viewerUserKey,
  );
  const peerParticipants = activeUserParticipants.filter(
    (participant) => normalizeIdValue(participant.userId) !== viewerUserKey,
  );

  if (!viewerParticipant || peerParticipants.length !== 1) {
    throw new Error("dm_conversation_access_required");
  }

  const peerUserId = peerParticipants[0]?.userId;
  if (!peerUserId) {
    throw new Error("dm_conversation_access_required");
  }
  await requireDirectMessageRelationshipAccess({
    ctx: args.ctx,
    viewerUserId: args.viewerUserId,
    targetUserId: peerUserId,
    preferredCommunityId: args.conversation.createdFromCommunityId,
  });
}

async function mapDirectParticipant(ctx: any, row: DirectMessageParticipantLike) {
  if (row.participantType === "agent") {
    return {
      id: String(row._id),
      participant_type: "agent" as const,
      user_id: null,
      handle: null,
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
    // A conversation's people know each other's public handle (their profile shows it).
    handle: String(user?.normalizedHandle ?? user?.handle ?? "").trim().replace(/^@+/, "") || null,
    display_name: profile.display_name ?? user?.displayName ?? null,
    avatar_url: profile.avatar_url ?? null,
    avatar_focus_x: profile.avatar_focus_x ?? 0.5,
    avatar_focus_y: profile.avatar_focus_y ?? 0.5,
    avatar_zoom: profile.avatar_zoom ?? 1,
    status: row.status,
    last_read_seq: Math.max(0, Math.floor(row.lastReadSeq ?? 0)),
  };
}

async function mapDirectConversation(
  ctx: any,
  row: DirectMessageConversationLike,
  opts?: { viewerUserId?: any | null },
) {
  const community = (await ctx.db.get(row.createdFromCommunityId)) as CommunityLike | null;
  const participants = await listConversationParticipants(ctx, row._id);
  const lastSeq = Math.max(0, Math.floor(row.lastSeq ?? 0));
  const lastMessage =
    lastSeq > 0
      ? ((await ctx.db
          .query("dmMessages" as any)
          .withIndex("by_conversation_seq", (q: any) =>
            q.eq("conversationId", row._id).eq("seq", lastSeq),
          )
          .first()) as DirectMessageLike | null)
      : null;
  const viewerUserKey = normalizeIdValue(opts?.viewerUserId);
  const viewerParticipant = viewerUserKey
    ? participants.find(
        (participant) =>
          participant.status === "active" &&
          normalizeIdValue(participant.userId) === viewerUserKey,
      ) ?? null
    : null;
  const viewerLastReadSeq = Math.max(0, Math.floor(viewerParticipant?.lastReadSeq ?? 0));
  const unreadCount = viewerParticipant ? Math.max(0, lastSeq - viewerLastReadSeq) : 0;
  const peerParticipant = viewerUserKey
    ? participants.find(
        (participant) =>
          participant.status === "active" &&
          participant.participantType === "user" &&
          normalizeIdValue(participant.userId) &&
          normalizeIdValue(participant.userId) !== viewerUserKey,
      ) ?? null
    : null;
  const viewerHasBlockedPeer =
    viewerUserKey && peerParticipant?.userId
      ? Boolean(await findDirectMessageBlockRow(ctx, opts?.viewerUserId, peerParticipant.userId))
      : false;
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
    last_seq: lastSeq,
    viewer_last_read_seq: viewerLastReadSeq,
    unread_count: unreadCount,
    has_unread: unreadCount > 0,
    viewer_muted: Boolean(viewerParticipant?.mutedAt),
    viewer_has_blocked_peer: viewerHasBlockedPeer,
    last_message_from_viewer:
      Boolean(viewerUserKey) &&
      Boolean(lastMessage?.senderUserId) &&
      normalizeIdValue(lastMessage?.senderUserId) === viewerUserKey,
    last_message_preview: (() => {
      const preview = lastMessage ? readDirectMessageTextPreview(lastMessage.contentJson) : null;
      if (!preview) return null;
      const lastMessageIsViewer =
        Boolean(viewerUserKey) &&
        Boolean(lastMessage?.senderUserId) &&
        normalizeIdValue(lastMessage?.senderUserId) === viewerUserKey;
      return lastMessageIsViewer ? `You: ${preview}` : preview;
    })(),
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
    client_message_id: normalizeClientMessageId(row.clientMessageId),
    content_json: await mapDirectMessageContentJsonForRead(ctx, row.contentJson),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

async function mapDirectTypingPresence(ctx: any, row: DirectMessageTypingPresenceLike) {
  const user = row.userId ? ((await ctx.db.get(row.userId)) as UserRow | null) : null;
  const publicUserId = row.userId ? await resolvePublicUserId(ctx, row.userId) : null;
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
    user_id: publicUserId ?? normalizeIdValue(row.userId),
    display_name: profile.display_name ?? user?.displayName ?? null,
    avatar_url: profile.avatar_url ?? null,
    avatar_focus_x: profile.avatar_focus_x ?? 0.5,
    avatar_focus_y: profile.avatar_focus_y ?? 0.5,
    avatar_zoom: profile.avatar_zoom ?? 1,
    display_until_ms: row.displayUntil,
    updated_at: toIsoString(row.updatedAt),
  };
}

async function directTypingCandidateRemainsAuthorized(args: {
  ctx: any;
  conversation: DirectMessageConversationLike;
  userId: any;
}): Promise<boolean> {
  try {
    await requireDirectConversationSendAccess({
      ctx: args.ctx,
      conversation: args.conversation,
      viewerUserId: args.userId,
    });
    return true;
  } catch {
    return false;
  }
}

async function mapEligibleDirectMessageRecipient(args: {
  ctx: any;
  community: CommunityLike;
  viewerUserId: any;
  userId: any;
  search: string;
}) {
  const user = (await args.ctx.db.get(args.userId)) as UserRow | null;
  if (!user) return null;
  const profile = await resolveUserProfileDisplayProjectionForUser(args.ctx, user);
  const publicUserId = await resolvePublicUserId(args.ctx, args.userId);
  const handle = String(user.normalizedHandle ?? user.handle ?? "").trim().replace(/^@+/, "") || null;
  const searchable = [
    profile.display_name,
    user.displayName,
    handle,
    publicUserId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (args.search && !searchable.includes(args.search)) return null;

  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    });
  } catch {
    return null;
  }

  const existingConversation = await findDirectConversationByUsers(
    args.ctx,
    args.viewerUserId,
    args.userId,
  );
  return {
    user_id: publicUserId ?? String(args.userId),
    display_name: profile.display_name ?? user.displayName ?? null,
    handle,
    avatar_url: profile.avatar_url ?? null,
    avatar_focus_x: profile.avatar_focus_x ?? 0.5,
    avatar_focus_y: profile.avatar_focus_y ?? 0.5,
    avatar_zoom: profile.avatar_zoom ?? 1,
    community_id: String(args.community._id),
    community_name: args.community.name,
    existing_conversation_id: existingConversation ? String(existingConversation._id) : null,
  };
}

type EligibleDirectMessageRecipient = NonNullable<
  Awaited<ReturnType<typeof mapEligibleDirectMessageRecipient>>
>;

async function listDirectMessageSourceCommunitiesForViewer(
  ctx: any,
  viewerUserId: any,
): Promise<CommunityLike[]> {
  const ownedCommunities = (await ctx.db
    .query("communities" as any)
    .withIndex("by_owner_createdAt", (q: any) => q.eq("ownerId", viewerUserId))
    .order("desc")
    .take(MAX_DM_GLOBAL_OWNED_COMMUNITY_ROWS)) as CommunityLike[];
  const membershipRows = ((await ctx.db
    .query("communityMemberships" as any)
    .withIndex("by_user_createdAt", (q: any) => q.eq("userId", viewerUserId))
    .order("desc")
    .take(MAX_DM_GLOBAL_SOURCE_MEMBERSHIP_ROWS)) as CommunityMembershipLike[])
    .filter((row) => communityMembershipRowIsActive(row));

  const sourceRows: Array<{
    community: CommunityLike;
    isOwned: boolean;
    sortAt: number;
  }> = [];
  const seenCommunityIds = new Set<string>();
  const addCommunity = (community: CommunityLike | null, isOwned: boolean, sortAt: number) => {
    if (!community) return;
    const communityKey = normalizeIdValue(community._id);
    if (!communityKey || seenCommunityIds.has(communityKey)) return;
    seenCommunityIds.add(communityKey);
    sourceRows.push({ community, isOwned, sortAt });
  };

  for (const community of ownedCommunities) {
    addCommunity(community, true, community.createdAt);
  }
  for (const membership of membershipRows) {
    const community = (await ctx.db.get(membership.communityId)) as CommunityLike | null;
    addCommunity(community, false, membership.createdAt);
  }

  sourceRows.sort((left, right) => {
    if (left.isOwned !== right.isOwned) return left.isOwned ? -1 : 1;
    return right.sortAt - left.sortAt;
  });

  const accessibleCommunities: CommunityLike[] = [];
  for (const row of sourceRows) {
    if (accessibleCommunities.length >= MAX_DM_GLOBAL_SOURCE_COMMUNITIES) break;
    try {
      await requireCommunityChatAccess({
        ctx,
        communityId: row.community._id,
        userId: viewerUserId,
      });
      accessibleCommunities.push(row.community);
    } catch {
      continue;
    }
  }
  return accessibleCommunities;
}

async function listDirectMessageCandidateUserIdsForCommunity(args: {
  ctx: any;
  community: CommunityLike;
  maxUserIds: number;
}): Promise<any[]> {
  const maxUserIds = Math.max(
    1,
    Math.min(MAX_DM_GLOBAL_RECIPIENT_CANDIDATE_ROWS, Math.floor(args.maxUserIds)),
  );
  const userIds: any[] = [];
  const seenUserIds = new Set<string>();
  const addUserId = (userId: any) => {
    if (userIds.length >= maxUserIds) return;
    const userKey = normalizeIdValue(userId);
    if (!userKey || seenUserIds.has(userKey)) return;
    seenUserIds.add(userKey);
    userIds.push(userId);
  };

  addUserId(args.community.ownerId);

  const membershipRows = (await args.ctx.db
    .query("communityMemberships" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.community._id))
    .order("desc")
    .take(Math.min(maxUserIds, MAX_DM_GLOBAL_RECIPIENT_MEMBERSHIP_ROWS))) as CommunityMembershipLike[];

  for (const row of membershipRows) {
    if (!communityMembershipRowIsActive(row)) continue;
    addUserId(row.userId);
    if (userIds.length >= maxUserIds) break;
  }

  return userIds;
}

function normalizeClientMessageId(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim().slice(0, MAX_DM_CLIENT_MESSAGE_ID_CHARS);
  return normalized || null;
}

async function appendDirectMessageFromUser(args: {
  ctx: any;
  conversation: DirectMessageConversationLike;
  senderUserId: any;
  senderParticipantId: any;
  text: string;
  attachments: unknown;
  clientMessageId?: string | null;
}): Promise<DirectMessageLike> {
  const nowMs = Date.now();
  const clientMessageId = normalizeClientMessageId(args.clientMessageId);
  if (clientMessageId) {
    const existing = (await args.ctx.db
      .query("dmMessages" as any)
      .withIndex("by_conversation_clientMessageId", (q: any) =>
        q.eq("conversationId", args.conversation._id).eq("clientMessageId", clientMessageId),
      )
      .first()) as DirectMessageLike | null;
    if (existing) return existing;
  }
  const seq = Math.max(0, Math.floor(args.conversation.lastSeq ?? 0)) + 1;
  const text = normalizeDirectMessageText(args.text);
  const attachments = normalizeStoredDirectMessageAttachments(args.attachments, {
    enforceWritePolicy: true,
  });
  if (!text && attachments.length === 0) throw new Error("dm_message_payload_required");
  const contentJson = attachments.length > 0 ? { text, attachments } : { text };
  const messageId = await args.ctx.db.insert("dmMessages" as any, {
    conversationId: args.conversation._id,
    seq,
    senderType: "user",
    senderUserId: args.senderUserId,
    ...(clientMessageId ? { clientMessageId } : null),
    contentJson,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await args.ctx.db.patch(args.conversation._id, {
    lastSeq: seq,
    lastMessageAt: nowMs,
    updatedAt: nowMs,
  });
  await touchActiveConversationParticipantsActivity({
    ctx: args.ctx,
    conversationId: args.conversation._id,
    nowMs,
    senderParticipantId: args.senderParticipantId,
    senderLastReadSeq: seq,
  });
  const message = (await args.ctx.db.get(messageId)) as DirectMessageLike | null;
  if (!message) throw new Error("dm_message_create_failed");
  return message;
}

async function scheduleDirectMessageEmailNotification(args: {
  ctx: any;
  conversationId: any;
  messageSeq: number;
  recipientUserId: any;
  senderUserId: any;
}): Promise<void> {
  try {
    await args.ctx.scheduler.runAfter(
      DM_EMAIL_NOTIFY_DELAY_MS,
      (internal as any).directMessageEmails.maybeNotifyRecipientInternal,
      {
        conversationId: args.conversationId,
        messageSeq: args.messageSeq,
        recipientUserId: args.recipientUserId,
        senderUserId: args.senderUserId,
      },
    );
  } catch {
    // Email nudges are best-effort; the message itself already landed.
  }
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
    // Test members are an owner's stand-ins inside one community; they message no one.
    await requireNotTestMemberOutsideCommunity(ctx, viewerUserId);
    const targetUser = await findUserByPublicId(ctx, args.targetUserId);
    if (!targetUser) throw new Error("dm_target_not_found");
    if (normalizeIdValue(targetUser._id) === normalizeIdValue(viewerUserId)) {
      throw new Error("dm_target_self");
    }

    const nowMs = Date.now();
    const canonicalKey = buildDirectConversationCanonicalKey(viewerUserId, targetUser._id);
    let conversation = await findDirectConversationByUsers(ctx, viewerUserId, targetUser._id);
    const isNewConversation = !conversation;
    await requireDirectMessageRelationshipAccess({
      ctx,
      viewerUserId,
      targetUserId: targetUser._id,
      preferredCommunityId: args.communityId,
      requiredCommunityId: isNewConversation ? args.communityId : null,
    });

    if (isNewConversation) {
      await enforceDirectMessageRateLimit({ ctx, userId: viewerUserId, kind: "conversation" });
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
    } else if (conversation) {
      await ctx.db.patch(conversation._id, { updatedAt: nowMs });
      conversation = (await ctx.db.get(conversation._id)) as DirectMessageConversationLike | null;
    }
    if (!conversation) throw new Error("dm_conversation_create_failed");
    const participantFallbackActivityAt = isNewConversation ? nowMs : conversation.updatedAt;

    await ensureUserParticipant({
      ctx,
      conversationId: conversation._id,
      userId: viewerUserId,
      nowMs,
      touchActivity: isNewConversation,
      fallbackActivityAt: participantFallbackActivityAt,
    });
    await ensureUserParticipant({
      ctx,
      conversationId: conversation._id,
      userId: targetUser._id,
      nowMs,
      touchActivity: isNewConversation,
      fallbackActivityAt: participantFallbackActivityAt,
    });

    return await mapDirectConversation(ctx, conversation, { viewerUserId });
  },
});

export const listNetworkPeopleForViewer = query({
  args: {
    authSubject: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    excludeUserIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const safeLimit = Math.max(1, Math.min(MAX_DM_NETWORK_PEOPLE_ROWS, Math.floor(args.limit ?? 20)));
    const search = normalizeRecipientSearch(args.search);
    const excludedPublicUserIds = new Set(
      (args.excludeUserIds ?? [])
        .slice(0, MAX_DM_NETWORK_EXCLUDE_USER_IDS)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    );
    const sourceCommunities = await listDirectMessageSourceCommunitiesForViewer(ctx, viewerUserId);
    const viewerUserKey = normalizeIdValue(viewerUserId);
    const blockedUserKeys = await listDirectMessageBlockedUserKeysForViewer(ctx, viewerUserId);

    type NetworkCandidate = {
      userId: any;
      community: CommunityLike;
      lastSeenAtMs: number | null;
    };
    const candidatesByUser = new Map<string, NetworkCandidate>();
    const addCandidate = (userId: any, community: CommunityLike, lastSeenAtMs: number | null) => {
      const userKey = normalizeIdValue(userId);
      if (!userKey || userKey === viewerUserKey || blockedUserKeys.has(userKey)) return;
      const existing = candidatesByUser.get(userKey);
      if (existing && (existing.lastSeenAtMs ?? 0) >= (lastSeenAtMs ?? 0)) return;
      candidatesByUser.set(userKey, { userId, community, lastSeenAtMs });
    };

    for (const community of sourceCommunities) {
      const presenceRows = (await ctx.db
        .query("communityPresence" as any)
        .withIndex("by_community_lastSeenAt", (q: any) => q.eq("communityId", community._id))
        .order("desc")
        .take(MAX_DM_NETWORK_PRESENCE_ROWS_PER_COMMUNITY)) as CommunityPresenceLike[];
      for (const row of presenceRows) {
        const lastSeenAt = Number(row.lastSeenAt ?? 0);
        addCandidate(
          row.userId,
          community,
          Number.isFinite(lastSeenAt) && lastSeenAt > 0 ? lastSeenAt : null,
        );
      }
      const memberUserIds = await listDirectMessageCandidateUserIdsForCommunity({
        ctx,
        community,
        maxUserIds: MAX_DM_NETWORK_PRESENCE_ROWS_PER_COMMUNITY,
      });
      for (const userId of memberUserIds) {
        const userKey = normalizeIdValue(userId);
        if (!userKey || userKey === viewerUserKey || candidatesByUser.has(userKey)) continue;
        addCandidate(userId, community, null);
      }
    }

    const orderedCandidates = Array.from(candidatesByUser.entries())
      .map(([userKey, candidate]) => ({ ...candidate, userKey }))
      .sort(
        (left, right) =>
          (right.lastSeenAtMs ?? 0) - (left.lastSeenAtMs ?? 0) ||
          left.userKey.localeCompare(right.userKey),
      );

    const seenUserIds = new Set<string>();
    const people: Array<EligibleDirectMessageRecipient & { last_active_at: string | null }> = [];

    if (search) {
      const exactHandleUser = await findUserByNormalizedHandle(ctx, search);
      const exactHandleUserKey = exactHandleUser ? normalizeIdValue(exactHandleUser._id) : "";
      if (
        exactHandleUser &&
        exactHandleUserKey &&
        exactHandleUserKey !== viewerUserKey &&
        !blockedUserKeys.has(exactHandleUserKey)
      ) {
        for (const community of sourceCommunities) {
          const recipient = await mapEligibleDirectMessageRecipient({
            ctx,
            community,
            viewerUserId,
            userId: exactHandleUser._id,
            search,
          });
          if (!recipient) continue;
          const candidate = candidatesByUser.get(exactHandleUserKey) ?? null;
          seenUserIds.add(exactHandleUserKey);
          people.push({
            ...recipient,
            last_active_at: candidate?.lastSeenAtMs ? toIsoString(candidate.lastSeenAtMs) : null,
          });
          break;
        }
      }
    }

    for (const candidate of orderedCandidates) {
      if (people.length >= safeLimit) break;
      const userKey = normalizeIdValue(candidate.userId);
      if (!userKey || seenUserIds.has(userKey)) continue;
      if (excludedPublicUserIds.size > 0) {
        const publicUserId = await resolvePublicUserId(ctx, candidate.userId);
        if (publicUserId && excludedPublicUserIds.has(publicUserId)) {
          seenUserIds.add(userKey);
          continue;
        }
      }
      const recipient = await mapEligibleDirectMessageRecipient({
        ctx,
        community: candidate.community,
        viewerUserId,
        userId: candidate.userId,
        search,
      });
      if (!recipient) continue;
      seenUserIds.add(userKey);
      people.push({
        ...recipient,
        last_active_at: candidate.lastSeenAtMs ? toIsoString(candidate.lastSeenAtMs) : null,
      });
    }

    return {
      people,
      source_community_count: sourceCommunities.length,
      has_more: people.length >= safeLimit,
    };
  },
});

// Studio's DM functions below are thin wrappers: each resolves its signed-in
// user, then runs a helper that takes the viewer as already known. A community
// site's private twin (the ...ForTrustedUserInternal functions at the end)
// runs the very same helpers for the member its private session names, so
// every check, rate limit, block and refusal is Studio's.

export async function listMyDirectConversationsForUser(ctx: any, viewerUserId: any, limit?: number) {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit ?? 30)));
  const participants = (await ctx.db
    .query("dmParticipants" as any)
    .withIndex("by_user_status_lastActivityAt", (q: any) =>
      q.eq("userId", viewerUserId).eq("status", "active"),
    )
    .order("desc")
    .take(safeLimit)) as DirectMessageParticipantLike[];
  const conversationRows: Array<{
    conversation: DirectMessageConversationLike;
    sortAt: number;
  }> = [];
  for (const participant of participants) {
    const conversation = (await ctx.db.get(participant.conversationId)) as DirectMessageConversationLike | null;
    if (!conversation) continue;
    conversationRows.push({
      conversation,
      sortAt:
        typeof participant.lastActivityAt === "number" && Number.isFinite(participant.lastActivityAt)
          ? participant.lastActivityAt
          : conversation.updatedAt,
    });
  }
  conversationRows.sort((left, right) => right.sortAt - left.sortAt);
  return await Promise.all(
    conversationRows.map((row) =>
      mapDirectConversation(ctx, row.conversation, { viewerUserId }),
    ),
  );
}

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
    return await listMyDirectConversationsForUser(ctx, viewerUserId, args.limit);
  },
});

// Presence is only revealed for users the viewer shares a DM conversation
// with; people-zone presence flows through the mutual-community-gated
// listNetworkPeopleForViewer instead. Deliberately a point query — subscribing
// would re-run on every peer heartbeat.
export const listDirectMessagePeerPresenceForViewer = query({
  args: {
    authSubject: v.optional(v.string()),
    targetUserIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const targetPublicUserIds = Array.from(
      new Set(args.targetUserIds.map((value) => String(value ?? "").trim()).filter(Boolean)),
    ).slice(0, MAX_DM_PEER_PRESENCE_TARGETS);

    const peers: Array<{ user_id: string; last_active_at: string | null }> = [];
    for (const publicUserId of targetPublicUserIds) {
      const targetUser = await findUserByPublicId(ctx, publicUserId);
      if (!targetUser) continue;
      if (normalizeIdValue(targetUser._id) === normalizeIdValue(viewerUserId)) continue;
      const conversation = await findDirectConversationByUsers(ctx, viewerUserId, targetUser._id);
      if (!conversation) continue;
      const presenceRows = (await ctx.db
        .query("communityPresence" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", targetUser._id))
        .take(MAX_DM_PEER_PRESENCE_ROWS_PER_USER)) as CommunityPresenceLike[];
      let lastSeenAtMs = 0;
      for (const row of presenceRows) {
        const value = Number(row.lastSeenAt ?? 0);
        if (Number.isFinite(value) && value > lastSeenAtMs) lastSeenAtMs = value;
      }
      peers.push({
        user_id: publicUserId,
        last_active_at: lastSeenAtMs > 0 ? toIsoString(lastSeenAtMs) : null,
      });
    }
    return { peers };
  },
});

async function markDirectConversationReadForUser(
  ctx: any,
  viewerUserId: any,
  args: { conversationId: any; throughSeq?: number },
) {
  const { conversation, participant } = await requireActiveUserParticipant({
    ctx,
    conversationId: args.conversationId,
    userId: viewerUserId,
  });
  const lastSeq = Math.max(0, Math.floor(conversation.lastSeq ?? 0));
  const currentLastReadSeq = Math.max(0, Math.floor(participant.lastReadSeq ?? 0));
  const requestedThroughSeq =
    typeof args.throughSeq === "undefined" ? lastSeq : args.throughSeq;
  const nextLastReadSeq = nextDirectMessageReadSeq(
    currentLastReadSeq,
    requestedThroughSeq,
    lastSeq,
  );
  if (nextLastReadSeq > currentLastReadSeq) {
    await ctx.db.patch(participant._id, {
      lastReadSeq: nextLastReadSeq,
      updatedAt: Date.now(),
    });
  }
  return await mapDirectConversation(ctx, conversation, { viewerUserId });
}

export const markDirectConversationRead = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
    // Rolling-compatibility: older clients omit the exact rendered sequence and
    // retain the previous mark-current-head behavior during deployment.
    throughSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await markDirectConversationReadForUser(ctx, viewerUserId, args);
  },
});

async function setDirectConversationMutedForUser(ctx: any, viewerUserId: any, conversationId: any, muted: boolean) {
  const { conversation, participant } = await requireActiveUserParticipant({
    ctx,
    conversationId,
    userId: viewerUserId,
  });
  const nowMs = Date.now();
  await ctx.db.patch(participant._id, {
    mutedAt: muted ? nowMs : undefined,
    updatedAt: nowMs,
  });
  const refreshed = (await ctx.db.get(conversation._id)) as DirectMessageConversationLike | null;
  if (!refreshed) throw new Error("dm_conversation_not_found");
  return await mapDirectConversation(ctx, refreshed, { viewerUserId });
}

export const setDirectConversationMuted = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
    muted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await setDirectConversationMutedForUser(ctx, viewerUserId, args.conversationId, args.muted);
  },
});

async function setDirectTypingForUser(ctx: any, viewerUserId: any, conversationId: any) {
  const { conversation } = await requireActiveUserParticipant({
    ctx,
    conversationId,
    userId: viewerUserId,
  });
  await requireDirectConversationSendAccess({
    ctx,
    conversation,
    viewerUserId,
  });

  const nowMs = Date.now();
  const displayUntil = nowMs + TYPING_PRESENCE_LEASE_DURATION_MS;
  const existing = (await ctx.db
    .query("dmTypingPresence" as any)
    .withIndex("by_conversation_user", (q: any) =>
      q.eq("conversationId", conversationId).eq("userId", viewerUserId),
    )
    .unique()) as DirectMessageTypingPresenceLike | null;

  if (existing) {
    await ctx.db.patch(existing._id, {
      displayUntil,
      updatedAt: nowMs,
    });
    return { ok: true, display_until_ms: displayUntil };
  }

  await ctx.db.insert("dmTypingPresence" as any, {
    conversationId,
    userId: viewerUserId,
    displayUntil,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return { ok: true, display_until_ms: displayUntil };
}

export const setDirectTyping = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await setDirectTypingForUser(ctx, viewerUserId, args.conversationId);
  },
});

async function clearDirectTypingForUser(ctx: any, viewerUserId: any, conversationId: any) {
  await requireActiveUserParticipant({
    ctx,
    conversationId,
    userId: viewerUserId,
  });

  const existing = (await ctx.db
    .query("dmTypingPresence" as any)
    .withIndex("by_conversation_user", (q: any) =>
      q.eq("conversationId", conversationId).eq("userId", viewerUserId),
    )
    .unique()) as DirectMessageTypingPresenceLike | null;

  if (existing) {
    await ctx.db.delete(existing._id);
  }
  return { ok: true };
}

export const clearDirectTyping = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await clearDirectTypingForUser(ctx, viewerUserId, args.conversationId);
  },
});

async function listDirectTypingForUser(ctx: any, viewerUserId: any, conversationId: any) {
  const { conversation } = await requireActiveUserParticipant({
    ctx,
    conversationId,
    userId: viewerUserId,
  });

  const nowMs = Date.now();
  const rows = (await ctx.db
    .query("dmTypingPresence" as any)
    .withIndex("by_conversation_displayUntil", (q: any) =>
      q.eq("conversationId", conversationId).gt("displayUntil", nowMs),
    )
    .order("desc")
    .take(DIRECT_MESSAGE_TYPING_PRESENCE_SCAN_LIMIT)) as DirectMessageTypingPresenceLike[];
  const activeRows = rows.filter(
    (row) => normalizeIdValue(row.userId) !== normalizeIdValue(viewerUserId),
  );
  const authorizationResults = await Promise.all(
    activeRows.map(async (row) => ({
      row,
      authorized: await directTypingCandidateRemainsAuthorized({
        ctx,
        conversation,
        userId: row.userId,
      }),
    })),
  );
  const authorizedRows = authorizationResults
    .filter(({ authorized }) => authorized)
    .map(({ row }) => row);
  const users = await Promise.all(
    authorizedRows
      .slice(0, DIRECT_MESSAGE_TYPING_PRESENCE_VISIBLE_LIMIT)
      .map((row) => mapDirectTypingPresence(ctx, row)),
  );
  return {
    users,
    total_count: authorizedRows.length,
  };
}

export const listDirectTyping = query({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await listDirectTypingForUser(ctx, viewerUserId, args.conversationId);
  },
});

async function listDirectMessagesForUser(
  ctx: any,
  viewerUserId: any,
  args: { conversationId: any; beforeSeq?: number | null; limit?: number },
) {
  await requireActiveUserParticipant({
    ctx,
    conversationId: args.conversationId,
    userId: viewerUserId,
  });
  // Active participants can read existing DM history; current relationship is rechecked before each send.
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
}

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
    return await listDirectMessagesForUser(ctx, viewerUserId, args);
  },
});

async function generateDirectMessageAttachmentUploadUrlForConversation(ctx: any, viewerUserId: any, conversationId: any) {
  const { conversation } = await requireActiveUserParticipant({
    ctx,
    conversationId,
    userId: viewerUserId,
  });
  await requireDirectConversationSendAccess({
    ctx,
    conversation,
    viewerUserId,
  });
  return {
    uploadUrl: await ctx.storage.generateUploadUrl(),
  };
}

export const generateDirectMessageAttachmentUploadUrl = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await generateDirectMessageAttachmentUploadUrlForConversation(ctx, viewerUserId, args.conversationId);
  },
});

async function sendDirectMessageForUser(
  ctx: any,
  viewerUserId: any,
  args: { conversationId: any; text: string; attachments?: unknown; clientMessageId?: string | null },
) {
  // Test members are an owner's stand-ins inside one community; they message no one.
  await requireNotTestMemberOutsideCommunity(ctx, viewerUserId);
  const { conversation, participant } = await requireActiveUserParticipant({
    ctx,
    conversationId: args.conversationId,
    userId: viewerUserId,
  });
  await requireDirectConversationSendAccess({
    ctx,
    conversation,
    viewerUserId,
  });
  await enforceDirectMessageRateLimit({ ctx, userId: viewerUserId, kind: "message" });

  const message = await appendDirectMessageFromUser({
    ctx,
    conversation,
    senderUserId: viewerUserId,
    senderParticipantId: participant._id,
    text: args.text,
    attachments: args.attachments,
    clientMessageId: args.clientMessageId ?? null,
  });
  const viewerUserKey = normalizeIdValue(viewerUserId);
  const peerParticipant = (await listConversationParticipants(ctx, conversation._id)).find(
    (row) =>
      row.status === "active" &&
      row.participantType === "user" &&
      normalizeIdValue(row.userId) &&
      normalizeIdValue(row.userId) !== viewerUserKey,
  );
  if (peerParticipant?.userId) {
    await scheduleDirectMessageEmailNotification({
      ctx,
      conversationId: conversation._id,
      messageSeq: message.seq,
      recipientUserId: peerParticipant.userId,
      senderUserId: viewerUserId,
    });
  }
  return await mapDirectMessage(ctx, message);
}

export const sendDirectMessage = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
    text: v.string(),
    attachments: v.optional(v.array(v.any())),
    clientMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return await sendDirectMessageForUser(ctx, viewerUserId, args);
  },
});

async function sendDirectMessageToTargetForUser(
  ctx: any,
  viewerUserId: any,
  targetUser: UserRow,
  args: { communityId?: any | null; text: string; attachments?: unknown; clientMessageId?: string | null },
) {
  await requireNotTestMemberOutsideCommunity(ctx, viewerUserId);
  const contextCommunityId = await requireDirectMessageRelationshipAccess({
    ctx,
    viewerUserId,
    targetUserId: targetUser._id,
    preferredCommunityId: args.communityId ?? null,
    requiredCommunityId: null,
  });

  await enforceDirectMessageRateLimit({ ctx, userId: viewerUserId, kind: "message" });

  const nowMs = Date.now();
  let conversation = await findDirectConversationByUsers(ctx, viewerUserId, targetUser._id);
  const isNewConversation = !conversation;
  if (!conversation) {
    await enforceDirectMessageRateLimit({ ctx, userId: viewerUserId, kind: "conversation" });
    const conversationId = await ctx.db.insert("dmConversations" as any, {
      kind: DIRECT_CONVERSATION_KIND,
      canonicalKey: buildDirectConversationCanonicalKey(viewerUserId, targetUser._id),
      createdByUserId: viewerUserId,
      createdFromCommunityId: contextCommunityId,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    conversation = (await ctx.db.get(conversationId)) as DirectMessageConversationLike | null;
  }
  if (!conversation) throw new Error("dm_conversation_create_failed");

  await ensureUserParticipant({
    ctx,
    conversationId: conversation._id,
    userId: viewerUserId,
    nowMs,
    touchActivity: true,
  });
  await ensureUserParticipant({
    ctx,
    conversationId: conversation._id,
    userId: targetUser._id,
    nowMs,
    touchActivity: isNewConversation,
    fallbackActivityAt: conversation.updatedAt,
  });

  const { participant } = await requireActiveUserParticipant({
    ctx,
    conversationId: conversation._id,
    userId: viewerUserId,
  });
  const message = await appendDirectMessageFromUser({
    ctx,
    conversation,
    senderUserId: viewerUserId,
    senderParticipantId: participant._id,
    text: args.text,
    attachments: args.attachments,
    clientMessageId: args.clientMessageId ?? null,
  });
  await scheduleDirectMessageEmailNotification({
    ctx,
    conversationId: conversation._id,
    messageSeq: message.seq,
    recipientUserId: targetUser._id,
    senderUserId: viewerUserId,
  });
  const refreshedConversation = (await ctx.db.get(conversation._id)) as DirectMessageConversationLike | null;
  if (!refreshedConversation) throw new Error("dm_conversation_not_found");
  return {
    conversation: await mapDirectConversation(ctx, refreshedConversation, { viewerUserId }),
    message: await mapDirectMessage(ctx, message),
  };
}

export const sendDirectMessageToUser = mutation({
  args: {
    authSubject: v.optional(v.string()),
    targetUserId: v.string(),
    communityId: v.optional(v.id("communities")),
    text: v.string(),
    attachments: v.optional(v.array(v.any())),
    clientMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    // Test members are an owner's stand-ins inside one community; they message no one.
    await requireNotTestMemberOutsideCommunity(ctx, viewerUserId);
    const targetUser = await findUserByPublicId(ctx, args.targetUserId);
    if (!targetUser) throw new Error("dm_target_not_found");
    if (normalizeIdValue(targetUser._id) === normalizeIdValue(viewerUserId)) {
      throw new Error("dm_target_self");
    }
    return await sendDirectMessageToTargetForUser(ctx, viewerUserId, targetUser, args);
  },
});

async function setDirectMessageBlockForUser(ctx: any, viewerUserId: any, targetUser: UserRow, blocked: boolean) {
  const existing = await findDirectMessageBlockRow(ctx, viewerUserId, targetUser._id);
  if (!blocked) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true, blocked: false };
  }
  const nowMs = Date.now();
  if (!existing) {
    await ctx.db.insert("dmBlocks" as any, {
      blockerUserId: viewerUserId,
      blockedUserId: targetUser._id,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  }
  return { ok: true, blocked: true };
}

export const blockDirectMessageUser = mutation({
  args: {
    authSubject: v.optional(v.string()),
    targetUserId: v.string(),
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
    return await setDirectMessageBlockForUser(ctx, viewerUserId, targetUser, true);
  },
});

export const unblockDirectMessageUser = mutation({
  args: {
    authSubject: v.optional(v.string()),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const targetUser = await findUserByPublicId(ctx, args.targetUserId);
    if (!targetUser) throw new Error("dm_target_not_found");
    return await setDirectMessageBlockForUser(ctx, viewerUserId, targetUser, false);
  },
});

async function generateDirectMessageAttachmentUploadUrlForTarget(
  ctx: any,
  viewerUserId: any,
  targetUser: UserRow,
  communityId: any | null,
) {
  await requireDirectMessageRelationshipAccess({
    ctx,
    viewerUserId,
    targetUserId: targetUser._id,
    preferredCommunityId: communityId,
    requiredCommunityId: null,
  });
  return {
    uploadUrl: await ctx.storage.generateUploadUrl(),
  };
}

export const generateDirectMessageAttachmentUploadUrlForUser = mutation({
  args: {
    authSubject: v.optional(v.string()),
    targetUserId: v.string(),
    communityId: v.optional(v.id("communities")),
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
    return await generateDirectMessageAttachmentUploadUrlForTarget(ctx, viewerUserId, targetUser, args.communityId ?? null);
  },
});

// ---------------------------------------------------------------------------
// Messages on a community site's private twin. The caller (httpCommunityApps)
// has already checked a private session of a member of that community; these
// run Studio's helpers above for that member. The twin addresses a
// conversation by its id and a person by their handle, and gets back only the
// site shapes (shared/directMessageSiteShape.ts): no user ids, no storage ids.

const SITE_DM_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;

function siteConversationId(ctx: any, raw: string): any {
  const id = ctx.db.normalizeId("dmConversations", String(raw ?? ""));
  if (!id) throw new Error("dm_conversation_not_found");
  return id;
}

async function siteTargetByHandle(ctx: any, viewerUserId: any, handle: string): Promise<UserRow> {
  const target = await findUserByNormalizedHandle(ctx, handle);
  if (!target) throw new Error("dm_target_not_found");
  if (normalizeIdValue(target._id) === normalizeIdValue(viewerUserId)) throw new Error("dm_target_self");
  return target;
}

// Only files the member uploaded just now (upload URLs last an hour), never an
// existing file; their size and type as storage recorded them, not as claimed.
async function siteFreshAttachments(ctx: any, raw: Array<{ storage_id: string; name: string; type: "image" | "file" }>) {
  const nowMs = Date.now();
  const out: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    const storageId = ctx.db.system.normalizeId("_storage", item.storage_id);
    const file = storageId ? await ctx.db.system.get(storageId) : null;
    if (!file || nowMs - Number(file._creationTime) > SITE_DM_UPLOAD_MAX_AGE_MS) throw new Error("dm_attachment_storage_required");
    out.push({
      storageId: String(storageId), name: item.name, type: item.type,
      mime: typeof file.contentType === "string" ? file.contentType : null, size: Number(file.size) || 0,
    });
  }
  return out;
}

const siteAttachmentInput = v.array(v.object({
  storage_id: v.string(), name: v.string(), type: v.union(v.literal("image"), v.literal("file")),
}));

export const listSiteDirectConversationsForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await resolvePublicUserId(ctx, args.userId);
    const rows = await listMyDirectConversationsForUser(ctx, args.userId, 50);
    return rows.map((row) => siteDirectConversation(row, viewer));
  },
});

// One conversation and its newest page of messages (or the page before beforeSeq).
export const readSiteDirectConversationForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users"), conversationId: v.string(), beforeSeq: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const conversationId = siteConversationId(ctx, args.conversationId);
    const { conversation } = await requireActiveUserParticipant({ ctx, conversationId, userId: args.userId });
    const rows = await listDirectMessagesForUser(ctx, args.userId, {
      conversationId, beforeSeq: args.beforeSeq ?? null, limit: SITE_DM_PAGE_SIZE + 1,
    });
    const viewer = await resolvePublicUserId(ctx, args.userId);
    return {
      conversation: siteDirectConversation(await mapDirectConversation(ctx, conversation, { viewerUserId: args.userId }), viewer),
      messages: rows.slice(-SITE_DM_PAGE_SIZE).map((row) => siteDirectMessage(row, viewer)),
      has_more: rows.length > SITE_DM_PAGE_SIZE,
    };
  },
});

/**
 * An owner's or admin's message to one member, sent from the Members page's
 * bulk "Message" (convex/communityClients.ts). Same conversation, blocks,
 * relationship check and email nudge as a message typed by hand; the per-person
 * DM counters are left to the bulk action's own daily cap, which the caller enforces.
 */
export async function sendCommunityManagerDirectMessage(ctx: any, args: {
  senderUserId: any; targetUserId: any; communityId: any; text: string;
}): Promise<{ conversationId: string; seq: number }> {
  if (normalizeIdValue(args.targetUserId) === normalizeIdValue(args.senderUserId)) throw new Error("dm_target_self");
  await requireDirectMessageRelationshipAccess({
    ctx, viewerUserId: args.senderUserId, targetUserId: args.targetUserId,
    preferredCommunityId: args.communityId, requiredCommunityId: null,
  });
  const nowMs = Date.now();
  let conversation = await findDirectConversationByUsers(ctx, args.senderUserId, args.targetUserId);
  const isNewConversation = !conversation;
  if (!conversation) {
    const conversationId = await ctx.db.insert("dmConversations" as any, {
      kind: DIRECT_CONVERSATION_KIND,
      canonicalKey: buildDirectConversationCanonicalKey(args.senderUserId, args.targetUserId),
      createdByUserId: args.senderUserId,
      createdFromCommunityId: args.communityId,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    conversation = (await ctx.db.get(conversationId)) as DirectMessageConversationLike | null;
  }
  if (!conversation) throw new Error("dm_conversation_create_failed");
  await ensureUserParticipant({ ctx, conversationId: conversation._id, userId: args.senderUserId, nowMs, touchActivity: true });
  await ensureUserParticipant({ ctx, conversationId: conversation._id, userId: args.targetUserId, nowMs,
    touchActivity: isNewConversation, fallbackActivityAt: conversation.updatedAt });
  const { participant } = await requireActiveUserParticipant({ ctx, conversationId: conversation._id, userId: args.senderUserId });
  const message = await appendDirectMessageFromUser({
    ctx, conversation, senderUserId: args.senderUserId, senderParticipantId: participant._id, text: args.text, attachments: [],
  });
  await scheduleDirectMessageEmailNotification({ ctx, conversationId: conversation._id, messageSeq: message.seq,
    recipientUserId: args.targetUserId, senderUserId: args.senderUserId });
  return { conversationId: String(conversation._id), seq: message.seq };
}

// "Message @handle": their conversation with the member if there is one;
// otherwise who they are, once Studio's rules say the member may message them
// (a shared community, no block either way; a block refuses exactly as a
// missing shared community does). Nothing is created until the first send.
export const startSiteDirectConversationForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), handle: v.string() },
  handler: async (ctx, args) => {
    const target = await siteTargetByHandle(ctx, args.userId, args.handle);
    const existing = await findDirectConversationByUsers(ctx, args.userId, target._id);
    if (existing) {
      const mine = (await ctx.db
        .query("dmParticipants" as any)
        .withIndex("by_conversation_user", (q: any) => q.eq("conversationId", existing._id).eq("userId", args.userId))
        .first()) as DirectMessageParticipantLike | null;
      if (mine?.status === "active") return { conversation_id: String(existing._id), peer: null };
    }
    await requireDirectMessageRelationshipAccess({
      ctx, viewerUserId: args.userId, targetUserId: target._id, preferredCommunityId: args.communityId, requiredCommunityId: null,
    });
    const profile = await resolveUserProfileDisplayProjectionForUser(ctx, target);
    return {
      conversation_id: null,
      peer: {
        name: profile.display_name ?? target.displayName ?? null,
        handle: String(target.normalizedHandle ?? target.handle ?? "").replace(/^@+/, "") || null,
        avatar_url: profile.avatar_url ?? null,
      },
    };
  },
});

// A message into a conversation, or (by handle) the first one to a person,
// which Studio's send creates the conversation for, from this community.
export const sendSiteDirectMessageForTrustedUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    conversationId: v.optional(v.string()),
    handle: v.optional(v.string()),
    text: v.string(),
    attachments: siteAttachmentInput,
    clientMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachments = await siteFreshAttachments(ctx, args.attachments);
    const viewer = await resolvePublicUserId(ctx, args.userId);
    const send = { text: args.text, attachments, clientMessageId: args.clientMessageId ?? null };
    if (args.conversationId !== undefined) {
      const conversationId = siteConversationId(ctx, args.conversationId);
      const message = await sendDirectMessageForUser(ctx, args.userId, { conversationId, ...send });
      return { conversation_id: String(conversationId), message: siteDirectMessage(message, viewer) };
    }
    const target = await siteTargetByHandle(ctx, args.userId, String(args.handle ?? ""));
    const sent = await sendDirectMessageToTargetForUser(ctx, args.userId, target, { communityId: args.communityId, ...send });
    return { conversation_id: sent.conversation.id, message: siteDirectMessage(sent.message, viewer) };
  },
});

// Step 1 of Studio's attachment flow: where the browser sends the file.
export const generateSiteDirectMessageUploadUrlForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), conversationId: v.optional(v.string()), handle: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.conversationId !== undefined) {
      return await generateDirectMessageAttachmentUploadUrlForConversation(ctx, args.userId, siteConversationId(ctx, args.conversationId));
    }
    const target = await siteTargetByHandle(ctx, args.userId, String(args.handle ?? ""));
    return await generateDirectMessageAttachmentUploadUrlForTarget(ctx, args.userId, target, args.communityId);
  },
});

export const markSiteDirectConversationReadForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), conversationId: v.string(), throughSeq: v.number() },
  handler: async (ctx, args) => {
    const viewer = await resolvePublicUserId(ctx, args.userId);
    const row = await markDirectConversationReadForUser(ctx, args.userId, {
      conversationId: siteConversationId(ctx, args.conversationId), throughSeq: args.throughSeq,
    });
    return siteDirectConversation(row, viewer);
  },
});

export const setSiteDirectConversationMutedForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), conversationId: v.string(), muted: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await resolvePublicUserId(ctx, args.userId);
    const row = await setDirectConversationMutedForUser(ctx, args.userId, siteConversationId(ctx, args.conversationId), args.muted);
    return siteDirectConversation(row, viewer);
  },
});

export const setSiteDirectTypingForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), conversationId: v.string(), typing: v.boolean() },
  handler: async (ctx, args) => {
    const conversationId = siteConversationId(ctx, args.conversationId);
    if (args.typing) await setDirectTypingForUser(ctx, args.userId, conversationId);
    else await clearDirectTypingForUser(ctx, args.userId, conversationId);
    return { typing: args.typing };
  },
});

// Block or unblock the other person in one of the member's conversations
// (Studio blocks by person; the twin names the conversation, never an id).
export const setSiteDirectMessageBlockForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), conversationId: v.string(), blocked: v.boolean() },
  handler: async (ctx, args) => {
    const conversationId = siteConversationId(ctx, args.conversationId);
    const { conversation } = await requireActiveUserParticipant({ ctx, conversationId, userId: args.userId });
    const viewerKey = normalizeIdValue(args.userId);
    const peer = (await listConversationParticipants(ctx, conversationId)).find((row) =>
      row.participantType === "user" && normalizeIdValue(row.userId) && normalizeIdValue(row.userId) !== viewerKey);
    const target = peer?.userId ? ((await ctx.db.get(peer.userId)) as UserRow | null) : null;
    if (!target) throw new Error("dm_target_not_found");
    await setDirectMessageBlockForUser(ctx, args.userId, target, args.blocked);
    const viewer = await resolvePublicUserId(ctx, args.userId);
    return siteDirectConversation(await mapDirectConversation(ctx, conversation, { viewerUserId: args.userId }), viewer);
  },
});

// The live signal for the twin's Messages page (communityLive:watchMessages):
// a version that changes whenever the member's inbox (no conversation) or one
// of their conversations changes, and, for a conversation, whether the other
// person is typing. Never a message, a name or an id: the page re-reads
// through its private routes when the version moves.
const SITE_DM_INBOX_WATCH_ROWS = 50;
export async function readDirectMessageLiveSignalForUser(ctx: any, viewerUserId: any, rawConversationId: string | null) {
  if (rawConversationId === null) {
    // Every message, read, mute or new conversation touches the member's own participant rows.
    const rows = (await ctx.db
      .query("dmParticipants" as any)
      .withIndex("by_user_status_lastActivityAt", (q: any) => q.eq("userId", viewerUserId).eq("status", "active"))
      .order("desc")
      .take(SITE_DM_INBOX_WATCH_ROWS)) as DirectMessageParticipantLike[];
    return { version: `${rows.length}:${rows.reduce((latest, row) => Math.max(latest, Number(row.updatedAt) || 0), 0)}`, typing: null };
  }
  const conversationId = siteConversationId(ctx, rawConversationId);
  const { conversation } = await requireActiveUserParticipant({ ctx, conversationId, userId: viewerUserId });
  // New messages move lastSeq; reads and mutes move a participant row.
  const participants = await listConversationParticipants(ctx, conversationId);
  const version = [conversation.lastSeq, conversation.updatedAt, ...participants.map((row) => `${row.lastReadSeq}.${row.updatedAt}`)].join(":");
  const typing = await listDirectTypingForUser(ctx, viewerUserId, conversationId);
  const nowMs = Date.now();
  const until = typing.users.reduce((latest: number, user: { display_until_ms: number }) => Math.max(latest, user.display_until_ms), 0);
  return {
    version,
    // The absolute deadline changes on every renewal, so a steady typist's renewals reach the page.
    typing: typing.total_count > 0 ? { lease_until: until, expires_in_ms: Math.max(0, until - nowMs) } : null,
  };
}
