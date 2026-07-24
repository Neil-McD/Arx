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

const MAX_INTERACTION_ATTACHMENTS = 8;
const MAX_ATTACHMENT_NAME_CHARS = 256;
const MAX_ATTACHMENT_MIME_CHARS = 160;
const MAX_INTERACTION_IMAGE_DATA_URL_CHARS = 600_000;
const MAX_ATTACHMENT_CONTENT_HASH_CHARS = 256;

function normalizeInteractionAttachmentKind(record: Record<string, unknown>, mimeType?: string): CanonicalAttachmentKind {
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
    if (out.length >= MAX_INTERACTION_ATTACHMENTS) break;
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
    const dataUrlRaw = typeof record.data_url === "string"
      ? record.data_url
      : typeof record.dataUrl === "string"
        ? record.dataUrl
        : "";
    if (dataUrlRaw) {
      const normalizedDataUrl = dataUrlRaw.trim();
      if (
        normalizedDataUrl.startsWith("data:image/")
        && normalizedDataUrl.length <= MAX_INTERACTION_IMAGE_DATA_URL_CHARS
      ) {
        dataUrl = normalizedDataUrl;
      }
    }
    if (!storageId && !dataUrl) continue;
    out.push({
      id,
      name,
      attachmentKind: normalizeInteractionAttachmentKind(record, mimeType),
      ...(mimeType ? { mimeType } : {}),
      sizeBytes,
      ...(storageId ? { storageId } : {}),
      ...(dataUrl ? { dataUrl } : {}),
    });
  }
  return out;
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
}): Promise<string[]> {
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_attachment_target_required");
  }
  if (args.attachments.length === 0) return [];
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
        .take(MAX_INTERACTION_ATTACHMENTS)
    : await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_reply", (q: any) => q.eq("replyId", args.replyId))
        .take(MAX_INTERACTION_ATTACHMENTS);
  return await Promise.all(
    rows
      .filter((row: any) => row?.status === "uploaded")
      .map((row: CommunityInteractionAttachmentRow) => mapCanonicalInteractionAttachment(args.ctx, row)),
  );
}
