import { internal } from "./_generated/api";
import { parseCommunityConversationIdentity } from "../shared/communityConversationIdentity";
import {
  COMMUNITY_AGENT_MAX_IMAGE_ATTACHMENTS,
  COMMUNITY_AGENT_MAX_IMAGE_BYTES,
  COMMUNITY_AGENT_MAX_IMAGE_TOTAL_BYTES,
  isAllowedCommunityAgentImageMime,
  normalizeCommunityAgentImageMime,
  normalizeCommunityAgentImageName,
} from "../shared/communityAgentAttachments";

export type StoredCloudMessageAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  storageId?: string | null;
  dataUrl?: string | null;
  text?: string | null;
  truncated?: boolean | null;
};

export type CloudThreadAttachmentClaimLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  storageId: any;
  messageKey: string;
  status: "pending" | "attached";
  attachedMessageId?: any;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
};

export type CloudThreadAttachmentUploadTicketLike = {
  _id: any;
  ownerId: any;
  threadId: any;
  ticketKey: string;
  messageKey: string;
  claimedStorageId?: any;
  createdAt: number;
  expiresAt: number;
  claimedAt?: number;
};

const COMMUNITY_AGENT_ATTACHMENT_UPLOAD_RATE_WINDOW_MS = 60_000;
const COMMUNITY_AGENT_ATTACHMENT_UPLOAD_RATE_LIMIT = 16;
const COMMUNITY_AGENT_ATTACHMENT_UPLOAD_TICKET_TTL_MS = 10 * 60_000;
export const COMMUNITY_AGENT_ATTACHMENT_PENDING_TTL_MS = 60 * 60_000;
const COMMUNITY_AGENT_ATTACHMENT_MAX_PENDING_COUNT = 8;
const COMMUNITY_AGENT_ATTACHMENT_MAX_PENDING_BYTES = 50 * 1024 * 1024;

type AttachmentThreadLike = {
  _id: any;
  communityId?: string;
  threadKey?: string;
};

function isClaimedImageAttachmentThread(thread: AttachmentThreadLike): boolean {
  return Boolean(parseCommunityConversationIdentity(thread)?.communityId);
}

function createAttachmentId(): string {
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

async function maybeResolveCloudMessageStorageUrl(ctx: any, storageId: unknown): Promise<string | null> {
  const resolvedStorageId = String(storageId ?? "").trim();
  if (!resolvedStorageId) return null;
  const resolved = await ctx.storage.getUrl(resolvedStorageId as any);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

export async function deleteCloudStorageObjectIfPresent(ctx: any, storageId: unknown): Promise<void> {
  const resolvedStorageId = String(storageId ?? "").trim();
  if (!resolvedStorageId) return;
  const metadata = await ctx.db.system.get("_storage", resolvedStorageId as any);
  if (metadata) await ctx.storage.delete(resolvedStorageId as any);
}

function normalizeStoredCloudMessageAttachment(raw: unknown): StoredCloudMessageAttachment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : createAttachmentId();
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 256) : "attachment";
  const type = record.type === "image" ? "image" : "file";
  const mime = typeof record.mime === "string" && record.mime.trim() ? record.mime.trim().slice(0, 160) : null;
  const sizeRaw = Number(record.size);
  const size = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;
  const storageIdRaw =
    typeof record.storageId === "string"
      ? record.storageId
      : typeof record.storage_id === "string"
        ? record.storage_id
        : "";
  const storageId = storageIdRaw.trim() ? storageIdRaw.trim() : null;
  const dataUrl =
    typeof record.data_url === "string" && record.data_url.trim().startsWith("data:")
      ? record.data_url.trim()
      : null;
  const text = typeof record.text === "string" && record.text.trim() ? record.text.slice(0, 20_000) : null;
  const truncated = typeof record.truncated === "boolean" ? record.truncated : null;
  if (!storageId && !dataUrl && !text) return null;
  return {
    id,
    name,
    type,
    mime,
    size,
    ...(storageId ? { storageId } : null),
    ...(dataUrl ? { dataUrl } : null),
    ...(text ? { text } : null),
    ...(truncated !== null ? { truncated } : null),
  };
}

function normalizeStoredCloudMessageAttachments(raw: unknown): StoredCloudMessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredCloudMessageAttachment[] = [];
  for (const item of raw) {
    const normalized = normalizeStoredCloudMessageAttachment(item);
    if (normalized) out.push(normalized);
  }
  return out;
}

async function hasOwnedThreadStorageClaim(
  ctx: any,
  ownerId: any,
  threadId: any,
  storageId: string,
): Promise<boolean> {
  let metadata: any = null;
  try {
    metadata = await ctx.db.system.get(storageId as any);
  } catch {
    return false;
  }
  const normalizedStorageId =
    metadata?._id &&
    typeof metadata?.size === "number" &&
    typeof metadata?.sha256 === "string"
      ? metadata._id
      : null;
  if (!normalizedStorageId) return false;
  const claim = await ctx.db
    .query("cloudThreadAttachments")
    .withIndex("by_owner_thread_storage", (q: any) =>
      q.eq("ownerId", ownerId).eq("threadId", threadId).eq("storageId", normalizedStorageId),
    )
    .first();
  return Boolean(claim);
}

export async function normalizeCommunityAgentMessageContent(args: {
  ctx: any;
  ownerId: any;
  thread: AttachmentThreadLike;
  messageKey: string;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
}): Promise<unknown> {
  if (args.role !== "user" || !isClaimedImageAttachmentThread(args.thread)) {
    // Even on non-community threads or assistant/system messages, never accept
    // an unowned storageId in contentJson.attachments (prevents signed-URL oracle).
    if (args.contentJson && typeof args.contentJson === "object" && !Array.isArray(args.contentJson)) {
      const attachments = normalizeStoredCloudMessageAttachments(
        (args.contentJson as Record<string, unknown>).attachments,
      );
      for (const attachment of attachments) {
        if (!attachment.storageId) continue;
        const owned = await hasOwnedThreadStorageClaim(
          args.ctx,
          args.ownerId,
          args.thread._id,
          attachment.storageId,
        );
        if (!owned) throw new Error("member_agent_attachment_claim_missing");
      }
    }
    return args.contentJson;
  }
  const record =
    args.contentJson && typeof args.contentJson === "object" && !Array.isArray(args.contentJson)
      ? (args.contentJson as Record<string, unknown>)
      : {};
  const text = String(record.text ?? "").trim();
  const rawAttachments = Array.isArray(record.attachments) ? record.attachments : [];
  if (rawAttachments.length > COMMUNITY_AGENT_MAX_IMAGE_ATTACHMENTS) {
    throw new Error("member_agent_attachment_limit_exceeded");
  }
  const attachments: StoredCloudMessageAttachment[] = [];
  const storageIds = new Set<string>();
  let totalBytes = 0;
  for (const raw of rawAttachments) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("member_agent_attachment_invalid");
    }
    const attachment = raw as Record<string, unknown>;
    const storageId = String(attachment.storage_id ?? attachment.storageId ?? "").trim();
    if (!storageId || storageIds.has(storageId)) {
      throw new Error("member_agent_attachment_invalid");
    }
    storageIds.add(storageId);
    const claim = (await args.ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_owner_thread_storage", (q: any) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("threadId", args.thread._id)
          .eq("storageId", storageId as any),
      )
      .unique()) as CloudThreadAttachmentClaimLike | null;
    if (!claim) throw new Error("member_agent_attachment_claim_required");
    if (claim.messageKey !== args.messageKey) {
      throw new Error("member_agent_attachment_message_mismatch");
    }
    if (claim.status !== "pending" && claim.status !== "attached") {
      throw new Error("member_agent_attachment_claim_invalid");
    }
    if (!isAllowedCommunityAgentImageMime(claim.mime)) {
      throw new Error("member_agent_attachment_type_not_supported");
    }
    if (claim.size <= 0 || claim.size > COMMUNITY_AGENT_MAX_IMAGE_BYTES) {
      throw new Error("member_agent_attachment_too_large");
    }
    totalBytes += claim.size;
    if (totalBytes > COMMUNITY_AGENT_MAX_IMAGE_TOTAL_BYTES) {
      throw new Error("member_agent_attachment_total_too_large");
    }
    attachments.push({
      id: String(attachment.id ?? "").trim() || createAttachmentId(),
      name: claim.name,
      type: "image",
      mime: claim.mime,
      size: claim.size,
      storageId: String(claim.storageId),
    });
  }
  if (!text && attachments.length === 0) {
    throw new Error("member_agent_message_empty");
  }
  return {
    text,
    ...(attachments.length > 0 ? { attachments } : null),
  };
}

export function listStoredCloudMessageStorageIds(contentJson: unknown): string[] {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
  const record = contentJson as Record<string, unknown>;
  return normalizeStoredCloudMessageAttachments(record.attachments)
    .map((attachment) => String(attachment.storageId ?? "").trim())
    .filter(Boolean);
}

export async function attachCommunityAgentClaimsToMessage(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
  messageId: any;
  messageKey: string;
  contentJson: unknown;
}): Promise<void> {
  for (const storageId of listStoredCloudMessageStorageIds(args.contentJson)) {
    const claim = (await args.ctx.db
      .query("cloudThreadAttachments")
      .withIndex("by_owner_thread_storage", (q: any) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("threadId", args.threadId)
          .eq("storageId", storageId as any),
      )
      .unique()) as CloudThreadAttachmentClaimLike | null;
    if (!claim || claim.messageKey !== args.messageKey) {
      throw new Error("member_agent_attachment_claim_required");
    }
    if (
      claim.status === "attached" &&
      claim.attachedMessageId &&
      String(claim.attachedMessageId) !== String(args.messageId)
    ) {
      throw new Error("member_agent_attachment_reuse_rejected");
    }
    await args.ctx.db.patch(claim._id, {
      status: "attached",
      attachedMessageId: args.messageId,
    });
  }
}

export async function deleteCommunityAgentClaimsForMessage(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
  messageKey: string;
  exceptStorageIds?: ReadonlySet<string>;
}): Promise<void> {
  const claims = (await args.ctx.db
    .query("cloudThreadAttachments")
    .withIndex("by_owner_messageKey", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("messageKey", args.messageKey),
    )
    .collect()) as CloudThreadAttachmentClaimLike[];
  for (const claim of claims) {
    if (String(claim.threadId) !== String(args.threadId)) continue;
    if (args.exceptStorageIds?.has(String(claim.storageId))) continue;
    await deleteCloudStorageObjectIfPresent(args.ctx, claim.storageId);
    await args.ctx.db.delete(claim._id);
  }
}

export async function mapCloudMessageContentJsonForRead(
  ctx: any,
  ownerId: any,
  threadId: any,
  contentJson: unknown,
): Promise<unknown> {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return contentJson;
  const record = contentJson as Record<string, unknown>;
  const attachments = normalizeStoredCloudMessageAttachments(record.attachments);
  if (attachments.length === 0) return contentJson;
  const resolvedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      const url = attachment.storageId
        ? (await hasOwnedThreadStorageClaim(ctx, ownerId, threadId, attachment.storageId))
          ? await maybeResolveCloudMessageStorageUrl(ctx, attachment.storageId)
          : null
        : undefined;
      return {
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        mime: attachment.mime,
        size: attachment.size,
        ...(attachment.storageId ? { storage_id: attachment.storageId } : null),
        ...(attachment.storageId ? { url: url ?? null } : null),
        ...(attachment.dataUrl ? { data_url: attachment.dataUrl } : null),
        ...(attachment.text ? { text: attachment.text } : null),
        ...(attachment.truncated !== null && typeof attachment.truncated !== "undefined"
          ? { truncated: attachment.truncated }
          : null),
      };
    }),
  );
  return {
    ...record,
    attachments: resolvedAttachments,
  };
}

export async function prepareCloudCommunityAgentAttachmentUploadCore(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
  messageKey: string;
}): Promise<{ ticketKey: string }> {
  const messageKey = String(args.messageKey ?? "").trim();
  if (!messageKey) throw new Error("member_agent_attachment_message_key_required");
  const nowMs = Date.now();
  const ownerTickets = (await args.ctx.db
    .query("cloudThreadAttachmentUploadTickets")
    .withIndex("by_owner_createdAt", (q: any) => q.eq("ownerId", args.ownerId))
    .collect()) as CloudThreadAttachmentUploadTicketLike[];
  for (const ticket of ownerTickets) {
    if (ticket.expiresAt < nowMs) {
      await args.ctx.db.delete(ticket._id);
    }
  }
  const recentTickets = (await args.ctx.db
    .query("cloudThreadAttachmentUploadTickets")
    .withIndex("by_owner_createdAt", (q: any) =>
      q
        .eq("ownerId", args.ownerId)
        .gte("createdAt", nowMs - COMMUNITY_AGENT_ATTACHMENT_UPLOAD_RATE_WINDOW_MS),
    )
    .collect()) as CloudThreadAttachmentUploadTicketLike[];
  if (recentTickets.length >= COMMUNITY_AGENT_ATTACHMENT_UPLOAD_RATE_LIMIT) {
    throw new Error("member_agent_attachment_upload_rate_limited");
  }
  const ticketKey = crypto.randomUUID();
  const ticketId = await args.ctx.db.insert("cloudThreadAttachmentUploadTickets", {
    ownerId: args.ownerId,
    threadId: args.threadId,
    ticketKey,
    messageKey,
    createdAt: nowMs,
    expiresAt: nowMs + COMMUNITY_AGENT_ATTACHMENT_UPLOAD_TICKET_TTL_MS,
  });
  await args.ctx.scheduler.runAfter(
    COMMUNITY_AGENT_ATTACHMENT_UPLOAD_TICKET_TTL_MS,
    (internal as any).threads.cleanupCloudMemberAgentAttachmentUploadTicket,
    { ticketId },
  );
  return {
    ticketKey,
  };
}

export async function claimStoredCloudCommunityAgentAttachmentCore(args: {
  ctx: any;
  ownerId: any;
  threadId: any;
  storageId: any;
  ticketKey: string;
  messageKey: string;
  name: string;
}): Promise<CloudThreadAttachmentClaimLike> {
  const ticketKey = String(args.ticketKey ?? "").trim();
  const messageKey = String(args.messageKey ?? "").trim();
  const ticket = (await args.ctx.db
    .query("cloudThreadAttachmentUploadTickets")
    .withIndex("by_owner_ticketKey", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("ticketKey", ticketKey),
    )
    .unique()) as CloudThreadAttachmentUploadTicketLike | null;
  const nowMs = Date.now();
  if (
    !ticket ||
    ticket.threadId !== args.threadId ||
    ticket.messageKey !== messageKey ||
    ticket.expiresAt < nowMs
  ) {
    throw new Error("member_agent_attachment_upload_ticket_invalid");
  }
  const existingStorageClaim = (await args.ctx.db
    .query("cloudThreadAttachments")
    .withIndex("by_storage", (q: any) => q.eq("storageId", args.storageId))
    .first()) as CloudThreadAttachmentClaimLike | null;
  if (existingStorageClaim) {
    throw new Error("member_agent_attachment_reuse_rejected");
  }
  const metadata = await args.ctx.db.system.get("_storage", args.storageId);
  if (!metadata) {
    throw new Error("member_agent_attachment_upload_missing");
  }
  const mime = normalizeCommunityAgentImageMime(metadata.contentType);
  const size = Number(metadata.size);
  if (!isAllowedCommunityAgentImageMime(mime)) {
    throw new Error("member_agent_attachment_type_not_supported");
  }
  if (!Number.isFinite(size) || size <= 0 || size > COMMUNITY_AGENT_MAX_IMAGE_BYTES) {
    throw new Error("member_agent_attachment_too_large");
  }
  const recentClaims = (await args.ctx.db
    .query("cloudThreadAttachments")
    .withIndex("by_owner_createdAt", (q: any) =>
      q
        .eq("ownerId", args.ownerId)
        .gte("createdAt", nowMs - COMMUNITY_AGENT_ATTACHMENT_PENDING_TTL_MS),
    )
    .collect()) as CloudThreadAttachmentClaimLike[];
  const pendingClaims = recentClaims.filter((claim) => claim.status === "pending");
  const pendingBytes = pendingClaims.reduce(
    (total, claim) => total + Math.max(0, Number(claim.size) || 0),
    0,
  );
  if (
    pendingClaims.length >= COMMUNITY_AGENT_ATTACHMENT_MAX_PENDING_COUNT ||
    pendingBytes + size > COMMUNITY_AGENT_ATTACHMENT_MAX_PENDING_BYTES
  ) {
    throw new Error("member_agent_attachment_pending_limit_exceeded");
  }
  const existing = (await args.ctx.db
    .query("cloudThreadAttachments")
    .withIndex("by_owner_thread_storage", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("threadId", args.threadId).eq("storageId", args.storageId),
    )
    .unique()) as CloudThreadAttachmentClaimLike | null;
  if (existing) throw new Error("member_agent_attachment_reuse_rejected");
  const id = await args.ctx.db.insert("cloudThreadAttachments", {
    ownerId: args.ownerId,
    threadId: args.threadId,
    storageId: args.storageId,
    messageKey,
    status: "pending",
    name: normalizeCommunityAgentImageName(args.name),
    mime,
    size: Math.floor(size),
    createdAt: nowMs,
  });
  await args.ctx.db.patch(ticket._id, {
    claimedStorageId: args.storageId,
    claimedAt: nowMs,
  });
  await args.ctx.scheduler.runAfter(
    COMMUNITY_AGENT_ATTACHMENT_PENDING_TTL_MS,
    (internal as any).threads.cleanupPendingCloudThreadAttachment,
    { attachmentId: id },
  );
  const claimed = (await args.ctx.db.get(id)) as CloudThreadAttachmentClaimLike | null;
  if (!claimed) throw new Error("member_agent_attachment_claim_failed");
  return claimed;
}
