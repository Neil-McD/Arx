import { mutation, query } from "./_generated/server";
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
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import { resolveViewerDirectMessageRelationship } from "./profileRelationshipCore";
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
  lastActivityAt?: number;
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
const DM_TYPING_DISPLAY_WINDOW_MS = 5000;
const MAX_DM_TYPING_PRESENCE_SCAN_ROWS = 12;
const MAX_DM_TYPING_PRESENCE_VISIBLE_ROWS = 4;
const MAX_DM_RECIPIENT_ROWS = 25;
const MAX_DM_GLOBAL_SOURCE_COMMUNITIES = 12;
const MAX_DM_GLOBAL_OWNED_COMMUNITY_ROWS = 12;
const MAX_DM_GLOBAL_SOURCE_MEMBERSHIP_ROWS = 48;
const MAX_DM_GLOBAL_RECIPIENT_MEMBERSHIP_ROWS = 150;
const MAX_DM_GLOBAL_RECIPIENT_CANDIDATE_ROWS = 150;
const DIRECT_CONVERSATION_KIND = "direct" as const;

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
  const normalized = String(rawText ?? "").replace(/\s+/g, " ").trim();
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

async function requireDirectMessageRelationshipAccess(args: {
  ctx: any;
  viewerUserId: any;
  targetUserId: any;
  preferredCommunityId?: any | null;
  requiredCommunityId?: any | null;
}): Promise<string> {
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
  return (await ctx.db
    .query("users")
    .withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", normalized))
    .first()) as UserRow | null;
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
        const patch: Record<string, unknown> = {
          lastActivityAt: args.nowMs,
          updatedAt: args.nowMs,
        };
        if (
          senderParticipantKey &&
          normalizeIdValue(participant._id) === senderParticipantKey &&
          senderLastReadSeq > Math.max(0, Math.floor(participant.lastReadSeq ?? 0))
        ) {
          patch.lastReadSeq = senderLastReadSeq;
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
    last_message_preview: lastMessage ? readDirectMessageTextPreview(lastMessage.contentJson) : null,
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

    await requireProfileSetupCompleteForUser(ctx, viewerUserId);

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

export const listEligibleDirectMessageRecipientsForViewer = query({
  args: {
    authSubject: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const safeLimit = Math.max(1, Math.min(MAX_DM_RECIPIENT_ROWS, Math.floor(args.limit ?? 20)));
    const search = normalizeRecipientSearch(args.search);
    const sourceCommunities = await listDirectMessageSourceCommunitiesForViewer(ctx, viewerUserId);
    const seenUserIds = new Set<string>();
    const recipients: EligibleDirectMessageRecipient[] = [];

    if (search) {
      const exactHandleUser = await findUserByNormalizedHandle(ctx, search);
      const exactHandleUserKey = exactHandleUser ? normalizeIdValue(exactHandleUser._id) : "";
      if (exactHandleUser && exactHandleUserKey && exactHandleUserKey !== normalizeIdValue(viewerUserId)) {
        for (const community of sourceCommunities) {
          const recipient = await mapEligibleDirectMessageRecipient({
            ctx,
            community,
            viewerUserId,
            userId: exactHandleUser._id,
            search,
          });
          if (!recipient) continue;
          seenUserIds.add(exactHandleUserKey);
          recipients.push(recipient);
          break;
        }
      }
    }

    const maxCandidateUserIdsPerCommunity = search
      ? MAX_DM_GLOBAL_RECIPIENT_CANDIDATE_ROWS
      : Math.max(safeLimit * 4, safeLimit);

    for (const community of sourceCommunities) {
      if (recipients.length >= safeLimit) break;
      const candidateUserIds = await listDirectMessageCandidateUserIdsForCommunity({
        ctx,
        community,
        maxUserIds: maxCandidateUserIdsPerCommunity,
      });
      for (const userId of candidateUserIds) {
        if (recipients.length >= safeLimit) break;
        const userKey = normalizeIdValue(userId);
        if (!userKey || userKey === normalizeIdValue(viewerUserId) || seenUserIds.has(userKey)) {
          continue;
        }
        const recipient = await mapEligibleDirectMessageRecipient({
          ctx,
          community,
          viewerUserId,
          userId,
          search,
        });
        if (!recipient) continue;
        seenUserIds.add(userKey);
        recipients.push(recipient);
      }
    }

    return recipients;
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
  },
});

export const markDirectConversationRead = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { conversation, participant } = await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });
    const lastSeq = Math.max(0, Math.floor(conversation.lastSeq ?? 0));
    const currentLastReadSeq = Math.max(0, Math.floor(participant.lastReadSeq ?? 0));
    if (lastSeq > currentLastReadSeq) {
      await ctx.db.patch(participant._id, {
        lastReadSeq: lastSeq,
        updatedAt: Date.now(),
      });
    }
    return await mapDirectConversation(ctx, conversation, { viewerUserId });
  },
});

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
    const { conversation } = await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });
    await requireProfileSetupCompleteForUser(ctx, viewerUserId);
    await requireDirectConversationSendAccess({
      ctx,
      conversation,
      viewerUserId,
    });

    const nowMs = Date.now();
    const displayUntil = nowMs + DM_TYPING_DISPLAY_WINDOW_MS;
    const existing = (await ctx.db
      .query("dmTypingPresence" as any)
      .withIndex("by_conversation_user", (q: any) =>
        q.eq("conversationId", args.conversationId).eq("userId", viewerUserId),
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
      conversationId: args.conversationId,
      userId: viewerUserId,
      displayUntil,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, display_until_ms: displayUntil };
  },
});

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
    await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });

    const existing = (await ctx.db
      .query("dmTypingPresence" as any)
      .withIndex("by_conversation_user", (q: any) =>
        q.eq("conversationId", args.conversationId).eq("userId", viewerUserId),
      )
      .unique()) as DirectMessageTypingPresenceLike | null;

    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});

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
    await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });

    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("dmTypingPresence" as any)
      .withIndex("by_conversation_displayUntil", (q: any) =>
        q.eq("conversationId", args.conversationId).gt("displayUntil", nowMs),
      )
      .order("desc")
      .take(MAX_DM_TYPING_PRESENCE_SCAN_ROWS)) as DirectMessageTypingPresenceLike[];
    const activeRows = rows.filter(
      (row) => normalizeIdValue(row.userId) !== normalizeIdValue(viewerUserId),
    );
    const users = await Promise.all(
      activeRows
        .slice(0, MAX_DM_TYPING_PRESENCE_VISIBLE_ROWS)
        .map((row) => mapDirectTypingPresence(ctx, row)),
    );
    return {
      users,
      total_count: activeRows.length,
    };
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
  },
});

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
    const { conversation } = await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });
    await requireProfileSetupCompleteForUser(ctx, viewerUserId);
    await requireDirectConversationSendAccess({
      ctx,
      conversation,
      viewerUserId,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const sendDirectMessage = mutation({
  args: {
    authSubject: v.optional(v.string()),
    conversationId: v.id("dmConversations"),
    text: v.string(),
    attachments: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { conversation, participant } = await requireActiveUserParticipant({
      ctx,
      conversationId: args.conversationId,
      userId: viewerUserId,
    });
    await requireProfileSetupCompleteForUser(ctx, viewerUserId);
    await requireDirectConversationSendAccess({
      ctx,
      conversation,
      viewerUserId,
    });

    const nowMs = Date.now();
    const seq = Math.max(0, Math.floor(conversation.lastSeq ?? 0)) + 1;
    const text = normalizeDirectMessageText(args.text);
    const attachments = normalizeStoredDirectMessageAttachments(args.attachments, {
      enforceWritePolicy: true,
    });
    if (!text && attachments.length === 0) throw new Error("dm_message_payload_required");
    const contentJson = attachments.length > 0 ? { text, attachments } : { text };
    const messageId = await ctx.db.insert("dmMessages" as any, {
      conversationId: conversation._id,
      seq,
      senderType: "user",
      senderUserId: viewerUserId,
      contentJson,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(conversation._id, {
      lastSeq: seq,
      lastMessageAt: nowMs,
      updatedAt: nowMs,
    });
    await touchActiveConversationParticipantsActivity({
      ctx,
      conversationId: conversation._id,
      nowMs,
      senderParticipantId: participant._id,
      senderLastReadSeq: seq,
    });
    const message = (await ctx.db.get(messageId)) as DirectMessageLike | null;
    if (!message) throw new Error("dm_message_create_failed");
    return await mapDirectMessage(ctx, message);
  },
});
