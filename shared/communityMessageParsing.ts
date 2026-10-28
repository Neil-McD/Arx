export type CommunityMessageAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  url?: string | null;
  storage_id?: string | null;
  data_url?: string | null;
  text?: string | null;
  truncated?: boolean | null;
};

export type ReplyPrefix = {
  sender: string;
  preview: string;
  rest: string;
};

function createAttachmentId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

export function extractTextFromContentJson(contentJson: unknown): string {
  if (contentJson === null || contentJson === undefined) return "";
  if (typeof contentJson === "string") {
    const trimmed = contentJson.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return extractTextFromContentJson(parsed);
    } catch {
      return trimmed;
    }
  }
  if (typeof contentJson === "object") {
    const asAny = contentJson as Record<string, unknown>;
    if (typeof asAny.text === "string") return asAny.text;
    if (typeof asAny.body === "string") return asAny.body;
  }
  return "";
}

export function parseMessageAttachments(contentJson: unknown): CommunityMessageAttachment[] {
  if (contentJson === null || contentJson === undefined) return [];
  let parsed: unknown = contentJson;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const raw = (parsed as Record<string, unknown>).attachments;
  if (!Array.isArray(raw)) return [];
  const out: CommunityMessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : createAttachmentId();
    const name = typeof record.name === "string" ? record.name : "attachment";
    const type = record.type === "image" ? "image" : "file";
    const mime = typeof record.mime === "string" ? record.mime : null;
    const size = Number.isFinite(record.size) ? Number(record.size) : 0;
    const url = typeof record.url === "string" ? record.url : null;
    const storage_id =
      typeof record.storage_id === "string"
        ? record.storage_id
        : typeof record.storageId === "string"
          ? record.storageId
          : null;
    const data_url = typeof record.data_url === "string" ? record.data_url : null;
    const text = typeof record.text === "string" ? record.text : null;
    const truncated = typeof record.truncated === "boolean" ? record.truncated : null;
    out.push({ id, name, type, mime, size, url, storage_id, data_url, text, truncated });
  }
  return out;
}

export function truncateReplyPreview(body: string): string {
  const singleLine = body.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 90) return singleLine;
  return `${singleLine.slice(0, 90)}…`;
}
