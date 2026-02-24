import type { EventRecord, MessageRecord, ToolCallRecord } from "../../runtime/arp/types";

export const MESSAGE_PAGE_SIZE = 200;
export const DELTA_EVENTS_PAGE_SIZE = 300;
export const TOOL_CALL_PAGE_SIZE = 120;
export const TOOL_CALLS_MIN_RELOAD_INTERVAL_MS = 400;

export type CloudThreadMessageRow = {
  id: string;
  thread_id: string;
  seq: number;
  role: string;
  content_json: unknown;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
  created_at: string | number | null;
};

function toUnixSecondsFromIso(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function serializeCloudContentJson(content: unknown): string {
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return JSON.stringify({ text: "" });
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return JSON.stringify(parsed);
      }
    } catch {
      // Keep as plain text payload.
    }
    return JSON.stringify({ text: content });
  }
  if (typeof content === "number" || typeof content === "boolean") {
    return JSON.stringify({ text: String(content) });
  }
  return JSON.stringify({ text: "" });
}

function extractMetaFieldFromCloudContent(
  contentJson: string,
  field: "engine_id" | "model_id",
): string | null {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const meta = (parsed as Record<string, unknown>).meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const value = (meta as Record<string, unknown>)[field];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function toMessageRecordFromCloud(row: CloudThreadMessageRow): MessageRecord {
  const createdAt =
    typeof row.created_at === "number" && Number.isFinite(row.created_at)
      ? row.created_at
      : toUnixSecondsFromIso(typeof row.created_at === "string" ? row.created_at : null) ??
        Math.floor(Date.now() / 1000);
  const contentJson = serializeCloudContentJson(row.content_json);
  const engineId = row.engine_id ?? extractMetaFieldFromCloudContent(contentJson, "engine_id");
  const modelId = row.model_id ?? extractMetaFieldFromCloudContent(contentJson, "model_id");
  return {
    id: row.id,
    session_id: row.thread_id,
    seq: typeof row.seq === "number" && Number.isFinite(row.seq) ? row.seq : null,
    role: row.role,
    content_json: contentJson,
    created_at: createdAt,
    engine_id: engineId,
    model_id: modelId,
    run_id: row.run_id ?? null,
  };
}

function normalizeContentJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

export function sameToolCallList(prev: ToolCallRecord[], next: ToolCallRecord[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.status !== b.status ||
      a.updated_at !== b.updated_at ||
      a.run_id !== b.run_id ||
      a.tool_name !== b.tool_name
    ) {
      return false;
    }
  }
  return true;
}

export function eventToMessageRecord(evt: EventRecord): MessageRecord | null {
  const evtType = (evt.type ?? "").trim();
  const role =
    evtType === "user_message"
      ? "user"
      : evtType === "assistant_message"
        ? "assistant"
        : null;
  if (!role) return null;

  let contentJson: string | null = null;
  let engineId: string | null = null;
  let modelId: string | null = null;
  let runId: string | null = null;
  if (evt.payload_json) {
    try {
      const parsed = JSON.parse(evt.payload_json) as { content?: unknown; meta?: unknown };
      if (parsed && typeof parsed === "object" && "content" in parsed) {
        contentJson = JSON.stringify(
          (parsed as { content: unknown }).content ?? { text: evt.text ?? "" },
        );
      }
      const meta = (parsed as { meta?: unknown }).meta;
      if (meta && typeof meta === "object") {
        const metaObj = meta as {
          engine_id?: unknown;
          model_id?: unknown;
          run_id?: unknown;
        };
        engineId = typeof metaObj.engine_id === "string" ? metaObj.engine_id : null;
        modelId = typeof metaObj.model_id === "string" ? metaObj.model_id : null;
        runId = typeof metaObj.run_id === "string" ? metaObj.run_id : null;
      }
    } catch {
      // Ignore malformed payloads.
    }
  }
  if (!contentJson) {
    contentJson = JSON.stringify({ text: evt.text ?? "" });
  }

  return {
    id: evt.id,
    session_id: evt.thread_id,
    seq: evt.seq,
    role,
    content_json: contentJson,
    created_at: evt.created_at,
    engine_id: engineId,
    model_id: modelId,
    run_id: runId,
  };
}

export function mergeMessagesWithDelta(params: {
  prev: MessageRecord[];
  sessionId: string;
  mappedDelta: MessageRecord[];
}): MessageRecord[] {
  const { prev, sessionId, mappedDelta } = params;
  if (prev.length === 0 || prev[0]?.session_id !== sessionId) {
    return mappedDelta;
  }

  const canonicalUserPayloads = new Set(
    mappedDelta
      .filter((message) => message.role === "user")
      .map((message) => normalizeContentJson(message.content_json)),
  );

  let next = [...prev];
  if (canonicalUserPayloads.size > 0) {
    next = next.filter((message) => {
      if (message.role !== "user") return true;
      if (!message.id.startsWith("optimistic-user-")) return true;
      const payload = normalizeContentJson(message.content_json);
      return !canonicalUserPayloads.has(payload);
    });
  }
  const seen = new Set(next.map((message) => message.id));
  for (const message of mappedDelta) {
    if (seen.has(message.id)) continue;
    next.push(message);
    seen.add(message.id);
  }
  return next;
}

export function findOldestThreadMessageSeq(messages: MessageRecord[], threadId: string): number | null {
  return messages.reduce<number | null>((acc, message) => {
    if (message.session_id !== threadId) return acc;
    const seq = typeof message.seq === "number" && Number.isFinite(message.seq) ? message.seq : null;
    if (seq === null || seq <= 0) return acc;
    return acc === null ? seq : Math.min(acc, seq);
  }, null);
}
