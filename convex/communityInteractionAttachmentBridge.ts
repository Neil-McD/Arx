import type { CommunityChatMessageLike } from "./communityCore";
import { normalizeIdValue } from "./communityCore";

type CanonicalAttachmentKind = "image" | "video" | "file";

type CommunityInteractionAttachmentRow = {
  _id: any;
  attachmentKind: CanonicalAttachmentKind;
  name: string;
  mimeType?: string;
  sizeBytes: number;
  storageId?: any;
  externalUrl?: string;
};

export type NormalizedInteractionAttachmentInput = {
  id: string;
  name: string;
  attachmentKind: CanonicalAttachmentKind;
  mimeType?: string;
  sizeBytes: number;
  storageId?: string;
  dataUrl?: string;
};

const MAX_LEGACY_INTERACTION_ATTACHMENTS = 8;
const MAX_ATTACHMENT_NAME_CHARS = 256;
const MAX_ATTACHMENT_MIME_CHARS = 160;
const MAX_LEGACY_IMAGE_DATA_URL_CHARS = 600_000;
const MAX_ATTACHMENT_CONTENT_HASH_CHARS = 256;

export function readLegacyInteractionAttachmentPayloads(message: CommunityChatMessageLike): unknown[] {
  const contentJson = message.contentJson;
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
  const rawAttachments = (contentJson as Record<string, unknown>).attachments;
  return Array.isArray(rawAttachments) ? rawAttachments : [];
}

function normalizeLegacyAttachmentKind(record: Record<string, unknown>, mimeType?: string): CanonicalAttachmentKind {
  if (record.type === "image") return "image";
  if (record.type === "video") return "video";
  const mime = String(mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export function normalizeInteractionAttachmentInputs(rawAttachments: unknown[]): NormalizedInteractionAttachmentInput[] {
  const out: NormalizedInteractionAttachmentInput[] = [];
  for (const raw of rawAttachments) {
    if (out.length >= MAX_LEGACY_INTERACTION_ATTACHMENTS) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `attachment-${out.length}`;
    const name = typeof record.name === "string" && record.name.trim()
      ? record.name.trim().slice(0, MAX_ATTACHMENT_NAME_CHARS)
      : "attachment";
    const mimeType = typeof record.mime === "string" && record.mime.trim()
      ? record.mime.trim().slice(0, MAX_ATTACHMENT_MIME_CHARS)
      : undefined;
    const storageIdRaw =
      typeof record.storageId === "string"
        ? record.storageId
        : typeof record.storage_id === "string"
          ? record.storage_id
          : "";
    const storageId = storageIdRaw.trim() ? storageIdRaw.trim() : undefined;
    const sizeRaw = Number(record.size);
    const sizeBytes = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;
    let dataUrl: string | undefined;
    if (typeof record.data_url === "string") {
      const normalizedDataUrl = record.data_url.trim();
      if (
        normalizedDataUrl.startsWith("data:image/")
        && normalizedDataUrl.length <= MAX_LEGACY_IMAGE_DATA_URL_CHARS
      ) {
        dataUrl = normalizedDataUrl;
      }
    }
    if (!storageId && !dataUrl) continue;
    out.push({
      id,
      name,
      attachmentKind: normalizeLegacyAttachmentKind(record, mimeType),
      ...(mimeType ? { mimeType } : {}),
      sizeBytes,
      ...(storageId ? { storageId } : {}),
      ...(dataUrl ? { dataUrl } : {}),
    });
  }
  return out;
}

async function hasCanonicalInteractionAttachmentsForTarget(args: {
  ctx: any;
  rootId?: any;
  replyId?: any;
}): Promise<boolean> {
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_attachment_target_required");
  }
  const row = args.rootId
    ? await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_root", (q: any) => q.eq("rootId", args.rootId))
        .first()
    : await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_reply", (q: any) => q.eq("replyId", args.replyId))
        .first();
  return Boolean(row);
}

export async function insertCanonicalInteractionAttachmentsForTarget(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  attachments: NormalizedInteractionAttachmentInput[];
  actorUserId?: any;
  nowMs: number;
  contentHashPrefix: string;
  skipIfExisting?: boolean;
}): Promise<string[]> {
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_attachment_target_required");
  }
  if (args.attachments.length === 0) return [];
  if (args.skipIfExisting && await hasCanonicalInteractionAttachmentsForTarget(args)) return [];
  const nowMs = Math.max(0, Math.floor(Number(args.nowMs) || Date.now()));
  const ids: string[] = [];
  for (const attachment of args.attachments) {
    const attachmentId = await args.ctx.db.insert("communityInteractionAttachments" as any, {
      communityId: args.communityId,
      ...(args.rootId ? { rootId: args.rootId } : {}),
      ...(args.replyId ? { replyId: args.replyId } : {}),
      attachmentKind: attachment.attachmentKind,
      status: "uploaded",
      name: attachment.name,
      ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      sizeBytes: attachment.sizeBytes,
      ...(attachment.storageId ? { storageId: attachment.storageId as any } : {}),
      ...(!attachment.storageId && attachment.dataUrl ? { externalUrl: attachment.dataUrl } : {}),
      contentHash: `${args.contentHashPrefix}:${attachment.id}`.slice(0, MAX_ATTACHMENT_CONTENT_HASH_CHARS),
      createdByActorType: "human",
      ...(args.actorUserId ? { createdByUserId: args.actorUserId } : {}),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    ids.push(normalizeIdValue(attachmentId));
  }
  return ids;
}

export async function insertCanonicalInteractionAttachmentsFromLegacyMessage(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  message: CommunityChatMessageLike;
  nowMs: number;
}): Promise<string[]> {
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_attachment_target_required");
  }
  const attachments = normalizeInteractionAttachmentInputs(readLegacyInteractionAttachmentPayloads(args.message));
  if (attachments.length === 0) return [];
  const createdAt = Math.max(0, Math.floor(Number(args.message.createdAt) || args.nowMs));
  return await insertCanonicalInteractionAttachmentsForTarget({
    ctx: args.ctx,
    communityId: args.communityId,
    rootId: args.rootId,
    replyId: args.replyId,
    attachments,
    actorUserId: args.message.senderUserId,
    nowMs: createdAt,
    contentHashPrefix: `legacy-chat:${normalizeIdValue(args.message._id)}`,
    skipIfExisting: true,
  });
}

async function mapCanonicalInteractionAttachment(ctx: any, row: CommunityInteractionAttachmentRow) {
  const storageId = row.storageId ? normalizeIdValue(row.storageId) : null;
  const resolvedStorageUrl = row.storageId ? await ctx.storage.getUrl(row.storageId as any) : null;
  const externalUrl = typeof row.externalUrl === "string" && row.externalUrl.trim()
    ? row.externalUrl.trim()
    : null;
  const externalDataUrl = externalUrl?.startsWith("data:image/") ? externalUrl : null;
  const externalHref = externalUrl && !externalDataUrl ? externalUrl : null;
  const url = typeof resolvedStorageUrl === "string" && resolvedStorageUrl.trim()
    ? resolvedStorageUrl.trim()
    : externalHref;
  return {
    id: normalizeIdValue(row._id),
    name: row.name,
    type: row.attachmentKind,
    mime: row.mimeType ?? null,
    size: Math.max(0, Math.floor(Number(row.sizeBytes) || 0)),
    ...(storageId ? { storage_id: storageId } : null),
    ...(url ? { url } : null),
    ...(externalDataUrl ? { data_url: externalDataUrl } : null),
  };
}

export async function listCanonicalInteractionAttachmentsForTarget(args: {
  ctx: any;
  rootId?: any;
  replyId?: any;
}): Promise<Array<Record<string, unknown>>> {
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_attachment_target_required");
  }
  const rows = args.rootId
    ? await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_root", (q: any) => q.eq("rootId", args.rootId))
        .take(MAX_LEGACY_INTERACTION_ATTACHMENTS)
    : await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_reply", (q: any) => q.eq("replyId", args.replyId))
        .take(MAX_LEGACY_INTERACTION_ATTACHMENTS);
  return await Promise.all(
    rows
      .filter((row: any) => row?.status === "uploaded")
      .map((row: CommunityInteractionAttachmentRow) => mapCanonicalInteractionAttachment(args.ctx, row)),
  );
}
