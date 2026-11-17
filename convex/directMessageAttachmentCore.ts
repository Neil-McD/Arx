import { COMMUNITY_ATTACHMENT_MAX_COUNT } from "../shared/communityAttachmentPolicy";

// What a stored message says about a file, and what a reader is sent. Never a
// storage id or a URL: the bytes are fetched through the download route, which
// checks the reader is in the conversation.
export type DirectMessageAttachmentEntry = { id: string; name: string; type: "image" | "video" | "file"; mime: string; size: number };

type AttachmentRow = {
  _id: any; uploaderUserId: any; conversationId?: any; targetUserId?: any; messageId?: any;
  uploadExpiresAt: number; status: "pending" | "sent" | "failed"; attachmentKind: "image" | "video" | "file";
  name: string; mimeType: string; sizeBytes: number; storageId?: any;
};

function entryOf(row: AttachmentRow): DirectMessageAttachmentEntry {
  return { id: String(row._id), name: row.name, type: row.attachmentKind, mime: row.mimeType, size: row.sizeBytes };
}

// A send names its files by reservation id and nothing else. Anything that
// carries a storage id, a URL or a size (an older page, or a forged request)
// is refused outright.
export function parseDirectMessageAttachmentIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("dm_attachments_not_supported");
  if (raw.length > COMMUNITY_ATTACHMENT_MAX_COUNT) throw new Error("dm_attachment_limit");
  const ids: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("dm_attachments_not_supported");
    const keys = Object.keys(item as Record<string, unknown>);
    const id = (item as Record<string, unknown>).attachment_id;
    if (keys.length !== 1 || keys[0] !== "attachment_id" || typeof id !== "string" || !id.trim()) {
      throw new Error("dm_attachments_not_supported");
    }
    if (ids.includes(id)) throw new Error("dm_attachment_unavailable");
    ids.push(id);
  }
  return ids;
}

// The sender's own finished uploads, reserved for this conversation (or for
// this person, when the conversation did not exist yet), not used before.
export async function requireSendableDirectMessageAttachments(ctx: any, args: {
  ids: string[]; senderUserId: any; conversationId: any; recipientUserId?: any | null; nowMs: number;
}): Promise<AttachmentRow[]> {
  const rows: AttachmentRow[] = [];
  for (const id of args.ids) {
    const rowId = ctx.db.normalizeId("dmAttachments", id);
    const row = rowId ? ((await ctx.db.get(rowId)) as AttachmentRow | null) : null;
    const forThisConversation = row?.conversationId
      ? String(row.conversationId) === String(args.conversationId)
      : Boolean(row?.targetUserId && args.recipientUserId && String(row.targetUserId) === String(args.recipientUserId));
    if (!row || String(row.uploaderUserId) !== String(args.senderUserId) || row.status !== "pending" || row.messageId ||
      !row.storageId || row.uploadExpiresAt <= args.nowMs || !forThisConversation) {
      throw new Error("dm_attachment_unavailable");
    }
    const claims = await ctx.db.query("dmAttachments").withIndex("by_storage", (q: any) => q.eq("storageId", row.storageId)).take(2);
    if (claims.length !== 1) throw new Error("dm_attachment_unavailable");
    rows.push(row);
  }
  return rows;
}

export async function attachDirectMessageAttachments(ctx: any, args: { rows: AttachmentRow[]; messageId: any; conversationId: any; nowMs: number }) {
  for (const row of args.rows) {
    await ctx.db.patch(row._id, { status: "sent", messageId: args.messageId, conversationId: args.conversationId, updatedAt: args.nowMs });
  }
}

export function directMessageAttachmentEntries(rows: AttachmentRow[]): DirectMessageAttachmentEntry[] {
  return rows.map(entryOf);
}

// What a message carries, from the rows, never from what the message's own
// JSON claims. Files from before Nov 5 have no row and are not served.
export async function readDirectMessageAttachments(ctx: any, messageId: any): Promise<DirectMessageAttachmentEntry[]> {
  const rows = (await ctx.db.query("dmAttachments").withIndex("by_message", (q: any) => q.eq("messageId", messageId))
    .take(COMMUNITY_ATTACHMENT_MAX_COUNT)) as AttachmentRow[];
  return rows.filter((row) => row.status === "sent" && row.storageId).map(entryOf);
}
