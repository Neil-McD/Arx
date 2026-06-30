import type { CommunityChatMessageLike } from "./communityCore";

// Migration-only bridge: projected canonical interactions may still point at legacy chat rows
// until attachment upload/backfill moves fully onto communityInteractionAttachments.
export async function resolveLegacyMessageAttachments(
  ctx: any,
  messageId: any,
): Promise<Array<Record<string, unknown>>> {
  if (!messageId) return [];
  const message = (await ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
  const contentJson = message?.contentJson;
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return [];
  const rawAttachments = (contentJson as Record<string, unknown>).attachments;
  if (!Array.isArray(rawAttachments)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const raw of rawAttachments.slice(0, 8)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `attachment-${out.length}`;
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "attachment";
    const type = record.type === "image" ? "image" : "file";
    const mime = typeof record.mime === "string" && record.mime.trim() ? record.mime.trim() : null;
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
      typeof record.data_url === "string" && record.data_url.trim().startsWith("data:image/")
        ? record.data_url.trim()
        : null;
    if (!storageId && !dataUrl) continue;
    const resolvedUrl = storageId ? await ctx.storage.getUrl(storageId as any) : null;
    out.push({
      id,
      name,
      type,
      mime,
      size,
      ...(storageId ? { storage_id: storageId } : null),
      ...(typeof resolvedUrl === "string" && resolvedUrl.trim() ? { url: resolvedUrl.trim() } : null),
      ...(dataUrl ? { data_url: dataUrl } : null),
    });
  }
  return out;
}
